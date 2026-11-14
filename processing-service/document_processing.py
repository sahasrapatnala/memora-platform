"""Bounded, source-preserving PDF, PPTX and DOCX extraction manifests."""
import hashlib
from pathlib import Path


def text_hash(value):
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def extract_document(path):
    path = Path(path)
    ext = path.suffix.lower()
    if ext == ".pdf":
        import fitz
        pages = []
        with fitz.open(path) as document:
            metadata = {key: value for key, value in (document.metadata or {}).items()
                        if isinstance(value, str) and len(value) <= 1000}
            for index, page in enumerate(document):
                text = page.get_text("text", sort=True)
                if len(text) > 100000:
                    raise ValueError("A PDF page exceeds the bounded extraction limit")
                pages.append({"page_number": index + 1, "content": text,
                              "sha256": text_hash(text), "ocr_required": not bool(text.strip())})
        if not pages:
            raise ValueError("PDF contains no pages")
        return {"kind": "document", "format": "PDF", "language": None,
                "duration_seconds": None, "speakers": [], "speaker_turns": [],
                "transcript_segments": [], "frames": [], "pages": pages, "slides": [],
                "metadata": {"page_count": len(pages),
                             "ocr_required_pages": [p["page_number"] for p in pages if p["ocr_required"]],
                             "extraction": "PyMuPDF text; OCR not run", **metadata}}

    if ext == ".pptx":
        from pptx import Presentation
        presentation = Presentation(path)
        slides = []
        for index, slide in enumerate(presentation.slides):
            texts = []
            for shape in slide.shapes:
                if getattr(shape, "has_text_frame", False):
                    texts.append(shape.text)
                if getattr(shape, "has_table", False):
                    for row in shape.table.rows:
                        texts.extend(cell.text for cell in row.cells)
                if getattr(shape, "shape_type", None) == 6:  # GROUP
                    for child in shape.shapes:
                        if getattr(child, "has_text_frame", False):
                            texts.append(child.text)
            notes = None
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes = slide.notes_slide.notes_text_frame.text
            title = slide.shapes.title.text if slide.shapes.title is not None else None
            content = "\n".join(value for value in texts if value)
            combined = content + (("\n" + notes) if notes else "")
            if len(combined) > 150000:
                raise ValueError("A presentation slide exceeds the bounded extraction limit")
            slides.append({"slide_number": index + 1, "title": title, "notes": notes,
                           "content": content, "sha256": text_hash(combined)})
        if not slides:
            raise ValueError("Presentation contains no slides")
        properties = presentation.core_properties
        return {"kind": "document", "format": "PPTX", "language": None,
                "duration_seconds": None, "speakers": [], "speaker_turns": [],
                "transcript_segments": [], "frames": [], "pages": [], "slides": slides,
                "metadata": {"slide_count": len(slides), "extraction": "python-pptx text and notes",
                             "title": (properties.title or "")[:1000],
                             "author": (properties.author or "")[:1000]}}

    from docx import Document
    document = Document(path)
    content = "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text)
    if len(content) > 100000:
        raise ValueError("DOCX extraction exceeds the bounded single-page manifest limit")
    return {"kind": "document", "format": "DOCX", "language": None,
            "duration_seconds": None, "speakers": [], "speaker_turns": [],
            "transcript_segments": [], "frames": [],
            "pages": [{"page_number": 1, "content": content, "sha256": text_hash(content),
                       "ocr_required": False}], "slides": [],
            "metadata": {"page_count": 1, "ocr_required_pages": [],
                         "extraction": "DOCX paragraphs; visual pagination unavailable"}}
