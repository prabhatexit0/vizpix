use image::{DynamicImage, ImageReader, Rgba};
use std::io::Cursor;
use wasm_bindgen::prelude::*;

fn decode_image(input: &[u8]) -> Result<DynamicImage, JsError> {
    let reader = ImageReader::new(Cursor::new(input))
        .with_guessed_format()
        .map_err(|e| JsError::new(&format!("Failed to read image format: {e}")))?;
    reader
        .decode()
        .map_err(|e| JsError::new(&format!("Failed to decode image: {e}")))
}

fn encode_png(img: &DynamicImage) -> Result<Vec<u8>, JsError> {
    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), image::ImageFormat::Png)
        .map_err(|e| JsError::new(&format!("Failed to encode PNG: {e}")))?;
    Ok(output)
}

#[wasm_bindgen]
pub fn invert_colors(input: &[u8]) -> Result<Vec<u8>, JsError> {
    let mut img = decode_image(input)?;
    img.invert();
    encode_png(&img)
}

#[wasm_bindgen]
pub fn get_image_dimensions(input: &[u8]) -> Result<Vec<u32>, JsError> {
    let img = decode_image(input)?;
    Ok(vec![img.width(), img.height()])
}

#[wasm_bindgen]
pub fn rotate_image(input: &[u8], degrees: u32) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let rotated = match degrees {
        90 => img.rotate90(),
        180 => img.rotate180(),
        270 => img.rotate270(),
        _ => return Err(JsError::new("Rotation must be 90, 180, or 270 degrees")),
    };
    encode_png(&rotated)
}

#[wasm_bindgen]
pub fn crop_image(input: &[u8], x: u32, y: u32, width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let (iw, ih) = (img.width(), img.height());

    if x + width > iw || y + height > ih {
        return Err(JsError::new(&format!(
            "Crop region ({x},{y},{width},{height}) exceeds image bounds ({iw},{ih})"
        )));
    }
    if width == 0 || height == 0 {
        return Err(JsError::new("Crop dimensions must be non-zero"));
    }

    let cropped = img.crop_imm(x, y, width, height);
    encode_png(&cropped)
}

#[wasm_bindgen]
pub fn adjust_image(input: &[u8], brightness: f32, contrast: f32, saturation: f32) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;

    // brightness: -100..100 mapped to brighten's i32 range
    let img = if brightness != 0.0 {
        img.brighten(brightness as i32)
    } else {
        img
    };

    // contrast: -100..100 mapped directly
    let img = if contrast != 0.0 {
        img.adjust_contrast(contrast)
    } else {
        img
    };

    // saturation: -100..100; manually lerp each pixel toward luminance
    let img = if saturation != 0.0 {
        let mut rgba = img.to_rgba8();
        let factor = (saturation / 100.0) + 1.0; // 0.0 = fully desaturated at -100, 2.0 = double at +100
        for pixel in rgba.pixels_mut() {
            let Rgba([r, g, b, a]) = *pixel;
            let lum = 0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32;
            let nr = (lum + factor * (r as f32 - lum)).clamp(0.0, 255.0) as u8;
            let ng = (lum + factor * (g as f32 - lum)).clamp(0.0, 255.0) as u8;
            let nb = (lum + factor * (b as f32 - lum)).clamp(0.0, 255.0) as u8;
            *pixel = Rgba([nr, ng, nb, a]);
        }
        DynamicImage::ImageRgba8(rgba)
    } else {
        img
    };

    encode_png(&img)
}

#[wasm_bindgen]
pub fn apply_filter(input: &[u8], filter_name: &str) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let mut rgba = img.to_rgba8();

    match filter_name {
        "grayscale" => {
            for pixel in rgba.pixels_mut() {
                let Rgba([r, g, b, a]) = *pixel;
                let gray = (0.2126 * r as f32 + 0.7152 * g as f32 + 0.0722 * b as f32) as u8;
                *pixel = Rgba([gray, gray, gray, a]);
            }
        }
        "sepia" => {
            for pixel in rgba.pixels_mut() {
                let Rgba([r, g, b, a]) = *pixel;
                let (rf, gf, bf) = (r as f32, g as f32, b as f32);
                let nr = (0.393 * rf + 0.769 * gf + 0.189 * bf).min(255.0) as u8;
                let ng = (0.349 * rf + 0.686 * gf + 0.168 * bf).min(255.0) as u8;
                let nb = (0.272 * rf + 0.534 * gf + 0.131 * bf).min(255.0) as u8;
                *pixel = Rgba([nr, ng, nb, a]);
            }
        }
        "warm" => {
            for pixel in rgba.pixels_mut() {
                let Rgba([r, g, b, a]) = *pixel;
                let nr = (r as u16 + 20).min(255) as u8;
                let ng = (g as u16 + 10).min(255) as u8;
                let nb = b.saturating_sub(10);
                *pixel = Rgba([nr, ng, nb, a]);
            }
        }
        "cool" => {
            for pixel in rgba.pixels_mut() {
                let Rgba([r, g, b, a]) = *pixel;
                let nr = r.saturating_sub(10);
                let ng = g;
                let nb = (b as u16 + 20).min(255) as u8;
                *pixel = Rgba([nr, ng, nb, a]);
            }
        }
        "vintage" => {
            for pixel in rgba.pixels_mut() {
                let Rgba([r, g, b, a]) = *pixel;
                let (rf, gf, bf) = (r as f32, g as f32, b as f32);
                // Slight sepia + reduced contrast
                let nr = (0.35 * rf + 0.65 * gf + 0.15 * bf).min(255.0) as u8;
                let ng = (0.30 * rf + 0.60 * gf + 0.15 * bf).min(255.0) as u8;
                let nb = (0.25 * rf + 0.45 * gf + 0.15 * bf).min(255.0) as u8;
                // Fade: lift shadows
                let nr = (nr as u16 + 20).min(255) as u8;
                let ng = (ng as u16 + 15).min(255) as u8;
                let nb = (nb as u16 + 10).min(255) as u8;
                *pixel = Rgba([nr, ng, nb, a]);
            }
        }
        _ => return Err(JsError::new(&format!("Unknown filter: {filter_name}"))),
    }

    encode_png(&DynamicImage::ImageRgba8(rgba))
}
