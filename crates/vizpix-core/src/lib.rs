use image::ImageReader;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

/// Takes raw image bytes (PNG/JPEG), inverts all pixel colors,
/// and returns the result as a PNG-encoded byte array.
#[wasm_bindgen]
pub fn invert_colors(input: &[u8]) -> Result<Vec<u8>, JsError> {
    let reader = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|e| JsError::new(&format!("Failed to read image format: {e}")))?;

    let mut img = reader
        .decode()
        .map_err(|e| JsError::new(&format!("Failed to decode image: {e}")))?;

    img.invert();

    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), image::ImageFormat::Png)
        .map_err(|e| JsError::new(&format!("Failed to encode PNG: {e}")))?;

    Ok(output)
}
