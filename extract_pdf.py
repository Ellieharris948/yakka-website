import PyPDF2
import os

# Create directories
os.makedirs('./research', exist_ok=True)
os.makedirs('./temp', exist_ok=True)
os.makedirs('./final/images', exist_ok=True)

# Extract text from PDF
pdf_path = './VERSION 3 NEW BRANDING YAKKA App Flow & Design .pdf'

with open(pdf_path, 'rb') as f:
    reader = PyPDF2.PdfReader(f)
    print(f"Number of pages: {len(reader.pages)}")
    
    all_text = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text()
        if text:
            all_text.append(f"--- PAGE {i+1} ---\n{text}")
            print(f"Page {i+1}: {len(text)} chars extracted")
        else:
            print(f"Page {i+1}: No text extracted")
    
    full_text = "\n\n".join(all_text)

# Save extracted text to temp file
with open('./temp/pdf_extracted_text.txt', 'w', encoding='utf-8') as f:
    f.write(full_text)

print(f"\nTotal text length: {len(full_text)} chars")
print("\n=== FULL EXTRACTED TEXT ===\n")
print(full_text)
