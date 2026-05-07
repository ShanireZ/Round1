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
    Path("C:/Windows/Fonts/NotoSansSC-VF.ttf"),
    Path("C:/Windows/Fonts/msyh.ttc"),
    Path("C:/Windows/Fonts/simhei.ttf"),
    Path("C:/Windows/Fonts/simsun.ttc"),
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


def overlay_replacements(page, replacements: list[Replacement], font_name: str) -> None:
    if not replacements:
        return
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    packet = io.BytesIO()
    canv = canvas.Canvas(packet, pagesize=(width, height))
    for item in replacements:
        canv.setFillColorRGB(0, 0, 0)
        canv.setFont(font_name, item.size)
        canv.drawString(item.x, item.y, item.text)
    canv.save()
    packet.seek(0)
    overlay = PdfReader(packet).pages[0]
    page.merge_page(overlay)


def collect_page_changes(
    *,
    page,
    pdf_name: str,
    reading_active: bool,
    pending_spill: bool,
) -> tuple[set[tuple[int, int]], list[Replacement], bool, bool]:
    lines = extract_lines(page)
    contents = page.get_contents()
    data = contents.get_data() if contents is not None else b""
    blocks = parse_blocks(data)
    has_reading_heading = any("二、阅读程序题" in line.text for line in lines)
    current_reading = reading_active or has_reading_heading
    completion_y = max(
        (line.y for line in lines if "三、完善程序题" in line.text),
        default=None,
    )
    removals: set[tuple[int, int]] = set()
    replacements: list[Replacement] = []
    next_pending_spill = False

    def mark_block(block: ContentBlock | None) -> None:
        if block is not None:
            removals.add((block.start, block.end))

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
        if is_sample_io_label(line):
            label_block = nearest_block(blocks, line)
            mark_block(label_block)
            mark_block(next_box_block(blocks, label_block) if label_block else None)
            if line.text.strip().startswith("样例输出") and line.y < 130.0:
                next_pending_spill = True
            continue
        cleaned = clean_line_text(line.text, pdf_name=pdf_name)
        if cleaned != line.text and ("样例输入" in line.text or "样例输出" in line.text):
            mark_block(nearest_block(blocks, line, max_delta=14.0))
            replacements.append(Replacement(x=line.x, y=line.y, size=line.size, text=cleaned))

    next_reading_active = current_reading and completion_y is None
    return removals, replacements, next_reading_active, next_pending_spill


def rewrite_pdf(path: Path, *, font_name: str, check_only: bool) -> tuple[bool, list[str]]:
    reader = PdfReader(str(path))
    writer = PdfWriter()
    reading_active = False
    pending_spill = False
    changed = False
    notes: list[str] = []

    for page_index, page in enumerate(reader.pages, start=1):
        removals, replacements, reading_active, next_pending_spill = collect_page_changes(
            page=page,
            pdf_name=path.name,
            reading_active=reading_active,
            pending_spill=pending_spill,
        )
        pending_spill = next_pending_spill
        if removals or replacements:
            changed = True
            notes.append(
                f"page {page_index}: removed {len(removals)} blocks, replaced {len(replacements)} lines"
            )
            if not check_only:
                contents = page.get_contents()
                data = contents.get_data() if contents is not None else b""
                blocks = parse_blocks(data)
                selected = [
                    block for block in blocks if (block.start, block.end) in removals
                ]
                if selected:
                    stream = DecodedStreamObject()
                    stream.set_data(remove_blocks(data, selected))
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
