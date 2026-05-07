from __future__ import annotations

import argparse
import importlib.util
import sys
from dataclasses import dataclass
from pathlib import Path

from pypdf import PdfReader
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GLOB = "example/*quality-sample*.pdf"


def load_cleanup_module():
    module_path = Path(__file__).with_name("cleanup_reading_program_sample_io_pdfs.py")
    spec = importlib.util.spec_from_file_location("cleanup_reading_program_sample_io_pdfs", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot import {module_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


CLEANUP = load_cleanup_module()
FONT_NAME = CLEANUP.register_font()
MONO_FONT = FONT_NAME


@dataclass
class FlowLine:
    x: float
    y: float
    size: float
    text: str


@dataclass
class CodeBlock:
    lines: list[str]


FlowItem = FlowLine | CodeBlock


def is_footer(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("Round1 ") and "第 " in stripped and "页" in stripped


def is_code_line(line: FlowLine) -> bool:
    stripped = line.text.strip()
    if not stripped:
        return False
    return line.size <= 8.6 and CLEANUP.looks_like_cpp_code_line(stripped)


def dedup_lines(page) -> list[FlowLine]:
    result: list[FlowLine] = []
    index_by_key: dict[tuple[float, float, float], int] = {}
    for line in CLEANUP.extract_lines(page):
        text = line.text.rstrip()
        if not text.strip() or is_footer(text):
            continue
        key = (round(line.x, 1), round(line.y, 1), round(line.size, 1))
        flow_line = FlowLine(x=line.x, y=line.y, size=line.size, text=text)
        if key in index_by_key:
            result[index_by_key[key]] = flow_line
        else:
            index_by_key[key] = len(result)
            result.append(flow_line)
    return result


def flow_items(reader: PdfReader) -> list[FlowItem]:
    items: list[FlowItem] = []
    code_lines: list[str] = []
    for page in reader.pages:
        for line in dedup_lines(page):
            if is_code_line(line):
                code_lines.append(line.text)
                continue
            if code_lines:
                items.append(CodeBlock(lines=code_lines))
                code_lines = []
            items.append(line)
        if code_lines:
            items.append(CodeBlock(lines=code_lines))
            code_lines = []
    return items


def wrap_text(text: str, font_name: str, font_size: float, max_width: float) -> list[str]:
    stripped = text.strip()
    if not stripped:
        return []
    lines: list[str] = []
    current = ""
    for char in stripped:
        candidate = current + char
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > max_width:
            lines.append(current)
            current = char
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def page_footer(canv: canvas.Canvas, width: float, page_number: int, total_pages: int | None) -> None:
    canv.setStrokeColor(colors.HexColor("#d9dee7"))
    canv.setLineWidth(0.5)
    canv.line(50, 42, width - 50, 42)
    canv.setFillColor(colors.HexColor("#4f5665"))
    canv.setFont(FONT_NAME, 8)
    canv.drawString(51, 26, "Round1 质量抽检卷")
    if total_pages is None:
        canv.drawRightString(width - 51, 26, f"第 {page_number} 页")
    else:
        canv.drawRightString(width - 51, 26, f"第 {page_number} 页 / 共 {total_pages} 页")


class ReflowWriter:
    def __init__(self, output: Path, width: float, height: float):
        self.output = output
        self.width = width
        self.height = height
        self.left = 57.0
        self.right = width - 57.0
        self.top = height - 62.0
        self.bottom = 58.0
        self.page_count = 0
        self.canv = canvas.Canvas(str(output), pagesize=(width, height))
        self.y = self.top
        self.new_page()

    def new_page(self) -> None:
        if self.page_count:
            page_footer(self.canv, self.width, self.page_count, None)
            self.canv.showPage()
        self.page_count += 1
        self.y = self.top

    def ensure_space(self, needed: float) -> None:
        if self.y - needed < self.bottom:
            self.new_page()

    def draw_text_line(self, item: FlowLine) -> None:
        stripped = item.text.strip()
        font_size = min(max(item.size, 8.5), 12.5)
        is_section = stripped.startswith(("一、", "二、", "三、"))
        is_group_heading = bool(__import__("re").match(r"^\d+\.\s*（本题", stripped))
        if is_section:
            font_size = 12.0
            before = 16.0
            after = 8.0
        elif is_group_heading:
            font_size = 10.0
            before = 12.0
            after = 5.0
        elif __import__("re").match(r"^\d+\.\d", stripped):
            before = 6.0
            after = 2.0
        else:
            before = 1.0
            after = 1.0

        max_width = self.right - self.left
        wrapped = wrap_text(stripped, FONT_NAME, font_size, max_width)
        if not wrapped:
            return
        line_height = font_size + 3.5
        needed = before + len(wrapped) * line_height + after
        self.ensure_space(needed)
        self.y -= before
        self.canv.setFillColor(colors.black)
        self.canv.setFont(FONT_NAME, font_size)
        for text in wrapped:
            self.canv.drawString(self.left, self.y, text)
            self.y -= line_height
        self.y -= after

    def draw_code_block(self, item: CodeBlock) -> None:
        lines = [line.rstrip() for line in item.lines if line.strip()]
        if not lines:
            return
        font_size = 7.6
        line_height = 9.2
        padding_x = 6.0
        padding_y = 6.0
        max_lines_per_page = max(1, int((self.top - self.bottom - 2 * padding_y) // line_height))
        start = 0
        while start < len(lines):
            available_lines = int((self.y - self.bottom - 2 * padding_y) // line_height)
            if available_lines < 3:
                self.new_page()
                available_lines = max_lines_per_page
            take = min(len(lines) - start, available_lines)
            chunk = lines[start : start + take]
            box_height = 2 * padding_y + len(chunk) * line_height
            self.ensure_space(box_height + 6.0)
            y_bottom = self.y - box_height
            self.canv.setFillColor(colors.HexColor("#f6f8fb"))
            self.canv.setStrokeColor(colors.HexColor("#dfe4ea"))
            self.canv.rect(self.left, y_bottom, self.right - self.left, box_height, fill=1, stroke=1)
            self.canv.setFillColor(colors.black)
            self.canv.setFont(MONO_FONT, font_size)
            text_y = self.y - padding_y - font_size
            for line in chunk:
                self.canv.drawString(self.left + padding_x, text_y, line)
                text_y -= line_height
            self.y = y_bottom - 10.0
            start += take

    def draw_item(self, item: FlowItem) -> None:
        if isinstance(item, CodeBlock):
            self.draw_code_block(item)
        else:
            self.draw_text_line(item)

    def save(self) -> None:
        page_footer(self.canv, self.width, self.page_count, None)
        self.canv.save()


def reflow_pdf(path: Path) -> None:
    reader = PdfReader(str(path))
    width = float(reader.pages[0].mediabox.width)
    height = float(reader.pages[0].mediabox.height)
    items = flow_items(reader)
    temp = path.with_suffix(".reflow.tmp.pdf")
    writer = ReflowWriter(temp, width, height)
    for item in items:
        writer.draw_item(item)
    writer.save()
    temp.replace(path)


def selected_pdfs(patterns: list[str]) -> list[Path]:
    paths: list[Path] = []
    for pattern in patterns:
        paths.extend(ROOT.glob(pattern))
    return sorted({path for path in paths if path.is_file()})


def main() -> int:
    parser = argparse.ArgumentParser(description="Reflow generated sample PDFs to remove page-tail gaps.")
    parser.add_argument("patterns", nargs="*", default=[DEFAULT_GLOB])
    args = parser.parse_args()

    paths = selected_pdfs(args.patterns)
    if not paths:
        print("No PDFs matched.")
        return 1
    for path in paths:
        reflow_pdf(path)
        print(f"reflowed: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
