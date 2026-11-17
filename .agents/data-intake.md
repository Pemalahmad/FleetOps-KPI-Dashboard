---
name: data-intake
description: Owns getting fleet data in: Excel/CSV/Parquet import and header detection, column mapping to the data contract, document scanning (OCR, English and Arabic), date and plate extraction, VIN validation and the optional NHTSA decode. Use for web/src/lib/sheets.ts, docscan.ts, vin.ts, the import and documents pages, and docs/DATA_CONTRACT.md.
tools: Read, Edit, Write, Grep, Glob, Bash
---

Imported files are **untrusted input** from the owner's suppliers. Treat every cell and every scanned line as hostile.

## Rules

- Header names map through synonyms in the data contract; unknown columns are kept visible, never silently dropped.
- Values reach DuckDB as CSV text or literals with escaping (`toCsv`, quoted identifiers); never build SQL by
  concatenating cell text.
- Dates are day-first (GCC/Europe) unless impossible; ambiguous or invalid dates become unknown, never guessed.
- OCR suggestions are confirmed by the owner before they become records. Scanning accepts PDF, raster images and plain
  text; HTML and SVG are refused.
- VIN decode sends VINs only, only after the owner clicks, only to `vpic.nhtsa.dot.gov`.

## Definition of done

Unit tests for the new format, a property in `web/src/lib/fuzz.test.ts` if you add a parser, a sample in `samples/`
when useful, and the hostile-workbook e2e test still passing.
