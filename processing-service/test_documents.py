import tempfile
import unittest
from pathlib import Path

import fitz
from pptx import Presentation

from document_processing import extract_document, text_hash


class DocumentExtraction(unittest.TestCase):
    def test_pdf_preserves_empty_page_and_hashes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.pdf"
            document = fitz.open()
            document.new_page().insert_text((72, 72), "Storage decision")
            document.new_page()
            document.save(path)
            document.close()
            first = extract_document(path)
            second = extract_document(path)
        self.assertEqual(first["metadata"]["page_count"], 2)
        self.assertEqual(first["pages"][0]["page_number"], 1)
        self.assertIn("Storage decision", first["pages"][0]["content"])
        self.assertEqual(first["pages"][0]["sha256"], text_hash(first["pages"][0]["content"]))
        self.assertEqual(first["pages"], second["pages"])
        self.assertTrue(first["pages"][1]["ocr_required"])
        self.assertEqual(first["pages"][1]["content"], "")
        self.assertEqual(first["metadata"]["ocr_required_pages"], [2])

    def test_pptx_preserves_slide_title_notes_and_empty_text(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "source.pptx"
            presentation = Presentation()
            slide = presentation.slides.add_slide(presentation.slide_layouts[1])
            slide.shapes.title.text = "Retention plan"
            slide.placeholders[1].text = "Retain the verified original"
            slide.notes_slide.notes_text_frame.text = "Reviewer note"
            presentation.slides.add_slide(presentation.slide_layouts[6])
            presentation.save(path)
            result = extract_document(path)
        self.assertEqual(result["metadata"]["slide_count"], 2)
        self.assertEqual(result["slides"][0]["slide_number"], 1)
        self.assertEqual(result["slides"][0]["title"], "Retention plan")
        self.assertIn("Retain the verified original", result["slides"][0]["content"])
        self.assertEqual(result["slides"][0]["notes"], "Reviewer note")
        self.assertEqual(result["slides"][1]["content"], "")
        expected = result["slides"][0]["content"] + "\nReviewer note"
        self.assertEqual(result["slides"][0]["sha256"], text_hash(expected))


if __name__ == "__main__":
    unittest.main()
