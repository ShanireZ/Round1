from __future__ import annotations

import argparse
import io
import re
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GLOB = "example/*quality-sample*.pdf"
FONT_CANDIDATES = [
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/simhei.ttf"),
    Path("C:/Windows/Fonts/simsun.ttc"),
    Path("C:/Windows/Fonts/NotoSansSC-VF.ttf"),
]

BLOCK_RE = re.compile(
    rb"q\s*\n1 0 0 1 ([+-]?(?:\d+(?:\.\d*)?|\.\d+)) ([+-]?(?:\d+(?:\.\d*)?|\.\d+)) cm\s*\nq\s*\n.*?\nQ\s*\nQ\s*\n",
    re.DOTALL,
)


@dataclass
class TextLine:
    x: float
    y: float
    size: float
    text: str


@dataclass
class ContentBlock:
    start: int
    end: int
    x: float
    y: float


@dataclass
class Replacement:
    x: float
    y: float
    size: float
    text: str
    erase: bool = True


@dataclass
class StreamReplacement:
    block: ContentBlock | None
    old_text: str
    new_text: str


@dataclass
class BlockShift:
    block: ContentBlock
    delta_y: float


def register_font() -> str:
    for candidate in FONT_CANDIDATES:
        if candidate.exists():
            pdfmetrics.registerFont(TTFont("Round1CJK", str(candidate)))
            return "Round1CJK"
    return "Helvetica"


def extract_lines(page) -> list[TextLine]:
    fragments: list[tuple[float, float, float, str]] = []

    def visitor(text, cm, tm, font_dict, font_size):
        if not text.strip():
            return
        x = float(cm[4] + tm[4])
        y = float(cm[5] + tm[5])
        fragments.append((x, y, float(font_size), text.replace("\n", "")))

    page.extract_text(visitor_text=visitor)
    lines: list[TextLine] = []
    for x, y, size, text in fragments:
        if (
            lines
            and abs(lines[-1].y - y) < 0.25
            and abs(lines[-1].size - size) < 0.25
        ):
            lines[-1].text += text
            lines[-1].x = min(lines[-1].x, x)
            continue
        lines.append(TextLine(x=x, y=y, size=size, text=text))
    return lines


def parse_blocks(data: bytes) -> list[ContentBlock]:
    blocks: list[ContentBlock] = []
    for match in BLOCK_RE.finditer(data):
        blocks.append(
            ContentBlock(
                start=match.start(),
                end=match.end(),
                x=float(match.group(1)),
                y=float(match.group(2)),
            )
        )
    return blocks


def nearest_block(blocks: list[ContentBlock], line: TextLine, *, max_delta: float = 12.0):
    candidates = [
        block
        for block in blocks
        if block.y <= line.y + 1.0 and abs(line.y - block.y) <= max_delta
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda block: abs(line.y - block.y))


def next_box_block(blocks: list[ContentBlock], label_block: ContentBlock):
    below = [block for block in blocks if block.y < label_block.y]
    if not below:
        return None
    candidate = max(below, key=lambda block: block.y)
    delta = label_block.y - candidate.y
    if 5.0 <= delta <= 25.0:
        return candidate
    return None


def block_segment(data: bytes, block: ContentBlock) -> bytes:
    return data[block.start : block.end]


TEXT_LITERAL_RE = re.compile(rb"\((?:\\.|[^\\()])*\)\s*Tj")


def unescape_pdf_literal(raw: bytes) -> str:
    result = bytearray()
    index = 0
    while index < len(raw):
        char = raw[index]
        if char != 0x5C:
            result.append(char)
            index += 1
            continue
        index += 1
        if index >= len(raw):
            break
        escaped = raw[index]
        index += 1
        if escaped in b"nrtbf":
            result.append({ord("n"): 10, ord("r"): 13, ord("t"): 9, ord("b"): 8, ord("f"): 12}[escaped])
        elif escaped in b"\\()":
            result.append(escaped)
        elif 48 <= escaped <= 55:
            digits = bytes([escaped])
            while index < len(raw) and len(digits) < 3 and 48 <= raw[index] <= 55:
                digits += bytes([raw[index]])
                index += 1
            result.append(int(digits, 8))
        else:
            result.append(escaped)
    return result.decode("latin1", errors="ignore")


def block_text_literals(data: bytes, block: ContentBlock) -> list[str]:
    texts: list[str] = []
    for match in TEXT_LITERAL_RE.finditer(block_segment(data, block)):
        raw = match.group(0)
        texts.append(unescape_pdf_literal(raw[1 : raw.rfind(b")")]))
    return texts


def block_has_exact_text(data: bytes, block: ContentBlock, text: str) -> bool:
    stripped = text.strip()
    return any(item.strip() == stripped for item in block_text_literals(data, block))


def is_option_text(text: str) -> bool:
    return re.match(r"\s*[A-D]\.\s+", text.strip()) is not None


def literal_looks_like_payload(text: str) -> bool:
    stripped = text.strip()
    if not stripped or is_option_text(stripped) or looks_like_cpp_code_line(stripped):
        return False
    if re.fullmatch(r"[-0-9 ]+", stripped):
        return True
    if re.search(r"[:：]\s*[-0-9]", stripped):
        return True
    if re.search(r"result\s*[:=]\s*[-0-9]", stripped, re.IGNORECASE):
        return True
    return False


def block_looks_like_payload(data: bytes, block: ContentBlock) -> bool:
    texts = block_text_literals(data, block)
    if any(is_option_text(text) for text in texts):
        return False
    return any(literal_looks_like_payload(text) for text in texts)


def payload_block(blocks: list[ContentBlock], data: bytes, line: TextLine) -> ContentBlock | None:
    stripped = line.text.strip()
    nearest = nearest_block(blocks, line, max_delta=180.0)
    if nearest is not None and block_has_exact_text(data, nearest, stripped):
        return nearest
    containing = [
        block
        for block in blocks
        if block_has_exact_text(data, block, stripped)
        and abs(line.y - block.y) <= 220.0
    ]
    if containing:
        return min(containing, key=lambda block: abs(line.y - block.y))
    if nearest is not None and block_looks_like_payload(data, nearest):
        return nearest
    return None


def is_sample_io_label(line: TextLine) -> bool:
    stripped = line.text.strip()
    return stripped.startswith("样例输入") or stripped.startswith("样例输出")


def clean_line_text(text: str, *, pdf_name: str) -> str:
    cleaned = text
    if "GESP-7" in pdf_name or "prefix-vertex" in cleaned:
        cleaned = re.sub(r"样例输入\s*([0-9A-Za-z_+\-]+)\s*时", r"当 target 取 \1 时", cleaned)
    cleaned = re.sub(r'当样例输入为\s*"([^"]+)"\s*时', r"当 n 取 \1 时", cleaned)
    cleaned = re.sub(r"当样例输入为\s*([^，。 ]+)\s*时", r"当 n 取 \1 时", cleaned)
    cleaned = cleaned.replace("样例输出由模板内置公式复算得到", "按程序逻辑复算得到")
    cleaned = cleaned.replace("样例输出由", "程序输出由")
    cleaned = cleaned.replace("假设输入为 6，回答下列问题。", "其中 n 初始化为 6，回答下列问题。")
    cleaned = cleaned.replace("输入为 7，程序输出什么？", "其中 n 初始化为 7，程序输出什么？")
    cleaned = cleaned.replace("当输入为5时", "当 n 初始化为 5 时")
    cleaned = cleaned.replace("根据给定的输入，回答后续问题。", "根据程序中的初始值，回答后续问题。")
    cleaned = cleaned.replace("根据输入值回答问题。", "根据程序中的初始值回答问题。")
    cleaned = cleaned.replace("以下程序读入一个整数 n", "以下程序将 n 初始化为 1")
    cleaned = cleaned.replace("该程序关于输入规模 n", "该程序关于变量 n")
    cleaned = cleaned.replace("当 target 取 3 时", "程序中 target 初值为 3 时")
    cleaned = re.sub(
        r"^(16\.1 （3 分）).*程序输出是多少？.*$",
        r"\1程序运行后输出是多少？",
        cleaned,
    )
    cleaned = re.sub(
        r"^(18\.1 （3 分）).*程序输出是多少？.*$",
        r"\1程序运行后输出是多少？",
        cleaned,
    )
    cleaned = re.sub(
        r"^(16\.1 （3 分）).*输出的下标是多少？（观察点 1：prefix-vertex-filter-885）.*$",
        r"\1程序运行后输出的下标是多少？（观察点 1：prefix-vertex-filter-885）",
        cleaned,
    )
    cleaned = re.sub(r"当输入为\s*([0-9\-]+)\s*时", r"当 n 初值为 \1 时", cleaned)
    cleaned = re.sub(r"若输入为\s*([0-9\-]+)", r"若 n 初值为 \1", cleaned)
    cleaned = re.sub(r"如果将输入改为\s*([0-9\-]+)", r"如果将 n 的初值改为 \1", cleaned)
    cleaned = re.sub(r"对于任意正整数输入\s*n", "对于任意正整数 n 初值", cleaned)
    cleaned = re.sub(r"如果输入n=([0-9\-]+)", r"如果 n 初值为 \1", cleaned)
    cleaned = re.sub(r"当输入n为([0-9\-]+)时", r"当 n 初值为 \1 时", cleaned)
    cleaned = re.sub(r"输入\s*n=([0-9\-]+)时", r"n 初值为 \1 时", cleaned)
    cleaned = re.sub(r"输入n=([0-9\-]+)时", r"n 初值为 \1 时", cleaned)
    cleaned = re.sub(r"输入\s*n=([0-9\-]+)", r"n 初值为 \1", cleaned)
    cleaned = re.sub(r"输入n=([0-9\-]+)", r"n 初值为 \1", cleaned)
    cleaned = re.sub(r"输入\s+([0-9\-]+)(?=[，。])", r"n 初值为 \1", cleaned)
    return cleaned


def line_in_reading_section(line: TextLine, reading_active: bool, completion_y: float | None) -> bool:
    if not reading_active:
        return False
    return completion_y is None or line.y > completion_y


def remove_blocks(data: bytes, blocks: list[ContentBlock]) -> bytes:
    result = data
    for block in sorted(blocks, key=lambda item: item.start, reverse=True):
        result = result[: block.start] + result[block.end :]
    return result


def is_same_block(left: ContentBlock, right: ContentBlock) -> bool:
    return left.start == right.start and left.end == right.end


def replacement_shift(y: float, shifts: list[tuple[float, float]]) -> float:
    delta = sum(shift for anchor_y, shift in shifts if y < anchor_y)
    return y + delta


def shifted_replacement(item: Replacement, shifts: list[tuple[float, float]]) -> Replacement:
    if not item.text:
        return item
    return Replacement(
        x=item.x,
        y=replacement_shift(item.y, shifts),
        size=item.size,
        text=item.text,
        erase=item.erase,
    )


def compute_compaction_shifts(
    blocks: list[ContentBlock],
    removed_blocks: list[ContentBlock],
) -> tuple[list[BlockShift], list[tuple[float, float]]]:
    unique_removed: list[ContentBlock] = []
    for block in removed_blocks:
        if not any(is_same_block(block, existing) for existing in unique_removed):
            unique_removed.append(block)

    shifts: list[tuple[float, float]] = []
    for removed in sorted(unique_removed, key=lambda item: item.y, reverse=True):
        retained_below = [
            block
            for block in blocks
            if block.y < removed.y
            and not any(is_same_block(block, removed_item) for removed_item in unique_removed)
        ]
        if not retained_below:
            continue
        next_block = max(retained_below, key=lambda item: item.y)
        delta = removed.y - next_block.y
        if 8.0 <= delta <= 90.0:
            shifts.append((removed.y, delta))

    if not shifts:
        return [], []

    block_shifts: list[BlockShift] = []
    for block in blocks:
        if any(is_same_block(block, removed) for removed in unique_removed):
            continue
        delta = sum(shift for anchor_y, shift in shifts if block.y < anchor_y)
        if delta:
            block_shifts.append(BlockShift(block=block, delta_y=delta))
    return block_shifts, shifts


def pdf_escape(text: str) -> bytes:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)").encode("latin1")


def replace_text_literal(segment: bytes, old_text: str, new_text: str) -> bytes:
    old = pdf_escape(old_text.rstrip())
    new = pdf_escape(new_text.rstrip())
    if old not in segment:
        old = pdf_escape(old_text)
    return segment.replace(old, new)


def apply_stream_replacements(data: bytes, replacements: list[StreamReplacement]) -> bytes:
    if not replacements:
        return data
    by_block: dict[tuple[int, int] | None, list[StreamReplacement]] = {}
    for replacement in replacements:
        key = (
            (replacement.block.start, replacement.block.end)
            if replacement.block is not None
            else None
        )
        by_block.setdefault(key, []).append(replacement)

    result = data
    for key, items in sorted(
        ((key, value) for key, value in by_block.items() if key is not None),
        key=lambda item: item[0][0],
        reverse=True,
    ):
        start, end = key
        segment = result[start:end]
        for item in items:
            segment = replace_text_literal(segment, item.old_text, item.new_text)
        result = result[:start] + segment + result[end:]

    for item in by_block.get(None, []):
        result = replace_text_literal(result, item.old_text, item.new_text)
    return result


def apply_content_changes(
    data: bytes,
    removals: set[tuple[int, int]],
    replacements: list[StreamReplacement],
    block_shifts: list[BlockShift],
) -> bytes:
    by_block: dict[tuple[int, int] | None, list[StreamReplacement]] = {}
    for replacement in replacements:
        key = (
            (replacement.block.start, replacement.block.end)
            if replacement.block is not None
            else None
        )
        by_block.setdefault(key, []).append(replacement)

    shift_by_block = {
        (shift.block.start, shift.block.end): shift.delta_y
        for shift in block_shifts
    }
    result = data
    operation_keys = set(removals) | {key for key in by_block if key is not None} | set(shift_by_block)
    for start, end in sorted(operation_keys, key=lambda item: item[0], reverse=True):
        if (start, end) in removals:
            result = result[:start] + result[end:]
            continue
        segment = result[start:end]
        delta_y = shift_by_block.get((start, end))
        if delta_y:
            segment = shift_content_block(segment, delta_y)
        for item in by_block.get((start, end), []):
            segment = replace_text_literal(segment, item.old_text, item.new_text)
        result = result[:start] + segment + result[end:]

    for item in by_block.get(None, []):
        result = replace_text_literal(result, item.old_text, item.new_text)
    return result


def shift_content_block(segment: bytes, delta_y: float) -> bytes:
    match = re.search(
        rb"(1 0 0 1 [+-]?(?:\d+(?:\.\d*)?|\.\d+) )([+-]?(?:\d+(?:\.\d*)?|\.\d+))( cm)",
        segment,
    )
    if not match:
        return segment
    new_y = float(match.group(2)) + delta_y
    return (
        segment[: match.start(2)]
        + f"{new_y:.5f}".encode("ascii")
        + segment[match.end(2) :]
    )


def overlay_replacements(page, replacements: list[Replacement], font_name: str) -> None:
    if not replacements:
        return
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    packet = io.BytesIO()
    canv = canvas.Canvas(packet, pagesize=(width, height))
    for item in replacements:
        if item.erase:
            canv.setFillColorRGB(1, 1, 1)
            canv.rect(item.x - 1.0, item.y - 2.5, width - item.x - 30.0, item.size + 6.0, fill=1, stroke=0)
        canv.setFillColorRGB(0, 0, 0)
        canv.setFont(font_name, item.size)
        canv.drawString(item.x, item.y, item.text)
    canv.save()
    packet.seek(0)
    overlay = PdfReader(packet).pages[0]
    page.merge_page(overlay)


def question_no_from_line(text: str) -> int | None:
    match = re.match(r"\s*(1[6-8])\.\s*（本题", text)
    if not match:
        return None
    return int(match.group(1))


def fixed_initial_value(pdf_name: str, question_no: int | None) -> tuple[str, str] | None:
    if question_no is None:
        return None
    if "CSP-J" in pdf_name and question_no == 18:
        return ("n", "6")
    if "GESP-1" in pdf_name:
        if question_no == 16:
            return ("n", "4286")
        if question_no == 17:
            return ("n", "1")
    if "GESP-2" in pdf_name:
        if question_no == 16:
            return ("n", "12")
        if question_no == 17:
            return ("n", "7")
        if question_no == 18:
            return ("n", "5")
    if "GESP-7" in pdf_name:
        if question_no == 16:
            return ("target", "3")
        if question_no == 17:
            return ("n", "5")
    if "GESP-8" in pdf_name and question_no == 18:
        return ("n", "7")
    return None


def rewritten_code_line(text: str, fixed: tuple[str, str] | None) -> str | None:
    if fixed is None:
        return None
    variable, value = fixed
    stripped = text.strip()
    leading = text[: len(text) - len(text.lstrip(" "))]

    if variable == "n":
        if stripped == "int n;":
            return f"{leading}int n = {value};"
        if stripped == "int n, s = 0, cnt = 0;":
            return f"{leading}int n = {value}, s = 0, cnt = 0;"
        if stripped == "cin >> n;":
            return leading
    if variable == "target":
        if stripped == "int target;":
            return f"{leading}int target = {value};"
        if stripped == "cin >> target;":
            return leading
    return None


def looks_like_cpp_code_line(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return True
    if stripped in {"{", "}", "} else {", "else {", "} else"}:
        return True
    if stripped.startswith(("#include", "//", "using namespace", "namespace ")):
        return True
    if stripped.startswith(
        (
            "int ",
            "long ",
            "bool ",
            "char ",
            "double ",
            "float ",
            "string ",
            "auto ",
            "vector",
            "stack",
            "queue",
            "set",
            "map",
            "for ",
            "for(",
            "while ",
            "while(",
            "if ",
            "if(",
            "else",
            "return",
            "cin",
            "cout",
            "sort",
        )
    ):
        return True
    return any(token in stripped for token in (";", "{", "}", "++", "--", "<<", ">>"))


def is_sample_payload_line(line: TextLine) -> bool:
    stripped = line.text.strip()
    if not stripped:
        return False
    if not (58.0 <= line.x <= 70.5 and line.size <= 8.5):
        return False
    if looks_like_cpp_code_line(stripped):
        return False
    if re.fullmatch(r"[-0-9 ]+", stripped):
        return True
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*\s*[:=].+", stripped):
        return True
    if re.fullmatch(r"[\u4e00-\u9fffA-Za-z_][\u4e00-\u9fffA-Za-z0-9_]*\s*[:：].+", stripped):
        return True
    return False


def collect_page_changes(
    *,
    page,
    pdf_name: str,
    reading_active: bool,
    pending_spill: bool,
    pending_payload: bool,
    pending_return: bool,
) -> tuple[
    set[tuple[int, int]],
    list[Replacement],
    list[StreamReplacement],
    list[BlockShift],
    bool,
    bool,
    bool,
    bool,
]:
    lines = extract_lines(page)
    contents = page.get_contents()
    data = contents.get_data() if contents is not None else b""
    blocks = parse_blocks(data)
    has_reading_heading = any("二、阅读程序题" in line.text for line in lines)
    current_reading = reading_active or has_reading_heading
    page_question = next(
        (question for question in (question_no_from_line(line.text) for line in lines) if question),
        None,
    )
    completion_y = max(
        (line.y for line in lines if "三、完善程序题" in line.text),
        default=None,
    )
    removals: set[tuple[int, int]] = set()
    removed_blocks: list[ContentBlock] = []
    replacements: list[Replacement] = []
    stream_replacements: list[StreamReplacement] = []
    next_pending_spill = False
    next_pending_payload = pending_payload
    next_pending_return = pending_return
    current_question: int | None = None
    payload_removed = False
    protected_options: list[Replacement] = []

    def mark_block(block: ContentBlock | None) -> None:
        if block is not None:
            removals.add((block.start, block.end))
            removed_blocks.append(block)

    if pending_spill and current_reading:
        for line in lines:
            if not line_in_reading_section(line, current_reading, completion_y):
                continue
            stripped = line.text.strip()
            if stripped.startswith(("16.", "17.", "18.", "二、", "三、")):
                break
            if 58.0 <= line.x <= 70.5 and line.size <= 8.5 and stripped:
                mark_block(nearest_block(blocks, line, max_delta=14.0))
                continue
            break

    for line in lines:
        if not line_in_reading_section(line, current_reading, completion_y):
            continue
        if re.match(r"\s*[A-D]\.\s+", line.text.strip()):
            protected_options.append(
                Replacement(x=line.x, y=line.y, size=line.size, text=line.text, erase=False)
            )
        maybe_question = question_no_from_line(line.text)
        if maybe_question is not None:
            current_question = maybe_question
            next_pending_payload = False
            next_pending_return = False
        if re.match(r"\s*(1[6-8])\.\d", line.text.strip()):
            next_pending_payload = False
            next_pending_return = False
        if is_sample_payload_line(line):
            mark_block(payload_block(blocks, data, line))
            payload_removed = True
            continue
        if is_sample_io_label(line):
            label_block = nearest_block(blocks, line)
            mark_block(label_block)
            mark_block(next_box_block(blocks, label_block) if label_block else None)
            if line.text.strip().startswith("样例输出") and line.y < 130.0:
                next_pending_spill = True
            continue
        fixed = fixed_initial_value(pdf_name, current_question or page_question)
        if fixed is None and "GESP-7" in pdf_name and "target" in line.text:
            fixed = ("target", "3")
        code_line = rewritten_code_line(line.text, fixed)
        if code_line is not None and code_line != line.text:
            stream_replacements.append(
                StreamReplacement(
                    block=None,
                    old_text=line.text,
                    new_text=code_line,
                )
            )
            continue
        stripped = line.text.strip()
        if "return 0;" in stripped:
            next_pending_return = True
        elif next_pending_return and stripped == "}":
            next_pending_return = False
            next_pending_payload = True
        cleaned = clean_line_text(line.text, pdf_name=pdf_name)
        if cleaned != line.text:
            mark_block(nearest_block(blocks, line, max_delta=3.0))
            replacements.append(Replacement(x=line.x, y=line.y, size=line.size, text=cleaned))

    block_shifts, overlay_shifts = compute_compaction_shifts(blocks, removed_blocks)

    if payload_removed:
        replacements.extend(protected_options)

    if overlay_shifts:
        replacements = [
            shifted_replacement(item, overlay_shifts)
            for item in replacements
        ]

    next_reading_active = current_reading and completion_y is None
    return (
        removals,
        replacements,
        stream_replacements,
        block_shifts,
        next_reading_active,
        next_pending_spill,
        next_pending_payload,
        next_pending_return,
    )


def rewrite_pdf(path: Path, *, font_name: str, check_only: bool) -> tuple[bool, list[str]]:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    reading_active = False
    pending_spill = False
    pending_payload = False
    pending_return = False
    changed = False
    notes: list[str] = []

    for page_index, page in enumerate(reader.pages, start=1):
        (
            removals,
            replacements,
            stream_replacements,
            block_shifts,
            reading_active,
            next_pending_spill,
            pending_payload,
            pending_return,
        ) = collect_page_changes(
            page=page,
            pdf_name=path.name,
            reading_active=reading_active,
            pending_spill=pending_spill,
            pending_payload=pending_payload,
            pending_return=pending_return,
        )
        pending_spill = next_pending_spill
        if removals or replacements or stream_replacements:
            changed = True
            notes.append(
                "page "
                f"{page_index}: removed {len(removals)} blocks, "
                f"shifted {len(block_shifts)} blocks, "
                f"replaced {len(replacements)} lines, "
                f"rewrote {len(stream_replacements)} code lines"
            )
            if not check_only:
                contents = page.get_contents()
                data = contents.get_data() if contents is not None else b""
                changed_data = apply_content_changes(data, removals, stream_replacements, block_shifts)
                if changed_data != data:
                    stream = DecodedStreamObject()
                    stream.set_data(changed_data)
                    page[NameObject("/Contents")] = stream
                overlay_replacements(page, replacements, font_name)
        writer.add_page(page)

    if changed and not check_only:
        with path.open("wb") as output:
            writer.write(output)
    return changed, notes


def reading_sample_hits(path: Path) -> list[str]:
    reader = PdfReader(str(path))
    hits: list[str] = []
    reading_active = False
    for page_index, page in enumerate(reader.pages, start=1):
        lines = extract_lines(page)
        if any("二、阅读程序题" in line.text for line in lines):
            reading_active = True
        completion_y = max(
            (line.y for line in lines if "三、完善程序题" in line.text),
            default=None,
        )
        for line in lines:
            if not line_in_reading_section(line, reading_active, completion_y):
                continue
            if "样例输入" in line.text or "样例输出" in line.text:
                hits.append(f"{path.name} page {page_index}: {line.text.strip()}")
        if completion_y is not None:
            reading_active = False
    return hits


def reading_cleanup_hits(path: Path) -> list[str]:
    reader = PdfReader(str(path))
    hits: list[str] = []
    reading_active = False
    for page_index, page in enumerate(reader.pages, start=1):
        lines = extract_lines(page)
        if any("二、阅读程序题" in line.text for line in lines):
            reading_active = True
        completion_y = max(
            (line.y for line in lines if "三、完善程序题" in line.text),
            default=None,
        )
        for line in lines:
            if not line_in_reading_section(line, reading_active, completion_y):
                continue
            stripped = line.text.strip()
            if "样例输入" in stripped or "样例输出" in stripped:
                hits.append(f"{path.name} page {page_index}: {stripped}")
            elif is_sample_payload_line(line):
                hits.append(f"{path.name} page {page_index}: sample payload {stripped}")
            elif stripped.startswith("cin >>"):
                hits.append(f"{path.name} page {page_index}: input statement {stripped}")
        if completion_y is not None:
            reading_active = False
    return hits


def selected_pdfs(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        paths.extend(ROOT.glob(pattern))
    return sorted({path for path in paths if path.is_file()})


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Remove reading_program sample input/output blocks from generated example PDFs."
    )
    parser.add_argument("patterns", nargs="*", default=[DEFAULT_GLOB])
    parser.add_argument("--check", action="store_true", help="Only report whether changes are needed.")
    args = parser.parse_args()

    font_name = register_font()
    paths = selected_pdfs(args.patterns)
    if not paths:
        print("No PDFs matched.")
        return 1

    if args.check:
        hits: list[str] = []
        for path in paths:
            hits.extend(reading_cleanup_hits(path))
        if hits:
            print("Remaining reading_program sample IO content:")
            for hit in hits:
                print(f"  {hit}")
            return 2
        for path in paths:
            print(f"clean: {path}")
        return 0

    changed_any = False
    for path in paths:
        reader = PdfReader(str(path))
        producer = str(reader.metadata.get("/Producer", "")) if reader.metadata else ""
        if "ReportLab" not in producer and "pypdf" not in producer:
            print(f"skip {path}: producer={producer!r}")
            continue
        changed, notes = rewrite_pdf(path, font_name=font_name, check_only=args.check)
        changed_any = changed_any or changed
        status = "would update" if args.check and changed else "updated" if changed else "clean"
        print(f"{status}: {path}")
        for note in notes:
            print(f"  {note}")

    hits = []
    for path in paths:
        if path.exists():
            hits.extend(reading_sample_hits(path))
    if hits:
        print("Remaining reading_program sample IO text:")
        for hit in hits:
            print(f"  {hit}")
        return 2
    return 1 if args.check and changed_any else 0


if __name__ == "__main__":
    raise SystemExit(main())
