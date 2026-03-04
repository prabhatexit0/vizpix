use image::{DynamicImage, ImageReader, RgbaImage, Rgba};
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

fn encode_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, JsError> {
    let mut output = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut output, quality);
    img.write_with_encoder(encoder)
        .map_err(|e| JsError::new(&format!("Failed to encode JPEG: {e}")))?;
    Ok(output)
}

fn blend_channel(base: f32, top: f32, mode: u32) -> f32 {
    match mode {
        0 => top, // normal
        1 => base * top, // multiply
        2 => 1.0 - (1.0 - base) * (1.0 - top), // screen
        3 => { // overlay
            if base < 0.5 {
                2.0 * base * top
            } else {
                1.0 - 2.0 * (1.0 - base) * (1.0 - top)
            }
        }
        4 => base.min(top), // darken
        5 => base.max(top), // lighten
        6 => { // color-dodge
            if top >= 1.0 { 1.0 } else { (base / (1.0 - top)).min(1.0) }
        }
        7 => { // color-burn
            if top <= 0.0 { 0.0 } else { (1.0 - (1.0 - base) / top).max(0.0) }
        }
        8 => { // hard-light
            if top < 0.5 {
                2.0 * base * top
            } else {
                1.0 - 2.0 * (1.0 - base) * (1.0 - top)
            }
        }
        9 => { // soft-light
            if top < 0.5 {
                base - (1.0 - 2.0 * top) * base * (1.0 - base)
            } else {
                let d = if base <= 0.25 {
                    ((16.0 * base - 12.0) * base + 4.0) * base
                } else {
                    base.sqrt()
                };
                base + (2.0 * top - 1.0) * (d - base)
            }
        }
        10 => (base - top).abs(), // difference
        11 => base + top - 2.0 * base * top, // exclusion
        _ => top, // fallback to normal
    }
}

#[wasm_bindgen]
pub fn composite_and_export(
    canvas_width: u32,
    canvas_height: u32,
    bg_r: u8,
    bg_g: u8,
    bg_b: u8,
    layers_pixels: &[u8],
    layers_meta: &[f64],
    format: &str,
    quality: u32,
) -> Result<Vec<u8>, JsError> {
    let cw = canvas_width as usize;
    let ch = canvas_height as usize;
    let num_pixels = cw * ch;
    let mut buf = vec![0u8; num_pixels * 4];

    // Fill background
    for i in 0..num_pixels {
        let off = i * 4;
        buf[off] = bg_r;
        buf[off + 1] = bg_g;
        buf[off + 2] = bg_b;
        buf[off + 3] = 255;
    }

    let meta_per_layer = 11;
    let num_layers = layers_meta.len() / meta_per_layer;
    let cx = canvas_width as f64 / 2.0;
    let cy = canvas_height as f64 / 2.0;

    for i in 0..num_layers {
        let m = &layers_meta[i * meta_per_layer..(i + 1) * meta_per_layer];
        let lw = m[0] as u32;
        let lh = m[1] as u32;
        let tx = m[2];
        let ty = m[3];
        let sx = m[4];
        let sy = m[5];
        let rot_deg = m[6];
        let opacity = m[7] as f32;
        let blend_mode = m[8] as u32;
        let pix_offset = m[9] as usize;
        let pix_length = m[10] as usize;

        if pix_offset + pix_length > layers_pixels.len() {
            continue;
        }
        let layer_data = &layers_pixels[pix_offset..pix_offset + pix_length];

        let rot = rot_deg * std::f64::consts::PI / 180.0;
        let cos_r = rot.cos();
        let sin_r = rot.sin();

        // Forward transform: canvas_pos = center + translate + rotate * scale * local_pos
        // where local_pos is relative to layer center (-lw/2..lw/2, -lh/2..lh/2)
        // Compute AABB of the transformed layer on canvas
        let hlw = lw as f64 / 2.0;
        let hlh = lh as f64 / 2.0;
        let corners = [
            (-hlw, -hlh),
            (hlw, -hlh),
            (hlw, hlh),
            (-hlw, hlh),
        ];

        let mut min_x = f64::MAX;
        let mut min_y = f64::MAX;
        let mut max_x = f64::MIN;
        let mut max_y = f64::MIN;

        for (lx, ly) in &corners {
            let scaled_x = lx * sx;
            let scaled_y = ly * sy;
            let rx = scaled_x * cos_r - scaled_y * sin_r;
            let ry = scaled_x * sin_r + scaled_y * cos_r;
            let canvas_x = cx + tx + rx;
            let canvas_y = cy + ty + ry;
            min_x = min_x.min(canvas_x);
            min_y = min_y.min(canvas_y);
            max_x = max_x.max(canvas_x);
            max_y = max_y.max(canvas_y);
        }

        let x0 = (min_x.floor() as i64).max(0) as usize;
        let y0 = (min_y.floor() as i64).max(0) as usize;
        let x1 = ((max_x.ceil() as i64) as usize).min(cw);
        let y1 = ((max_y.ceil() as i64) as usize).min(ch);

        // Inverse transform: local_pos = inv_scale * inv_rotate * (canvas_pos - center - translate)
        let inv_cos = cos_r; // cos(-r) = cos(r)
        let inv_sin = -sin_r; // sin(-r) = -sin(r)

        for py in y0..y1 {
            for px in x0..x1 {
                let dx = px as f64 - cx - tx;
                let dy = py as f64 - cy - ty;
                // Inverse rotate
                let rx = dx * inv_cos - dy * inv_sin;
                let ry = dx * inv_sin + dy * inv_cos;
                // Inverse scale
                let lx = rx / sx;
                let ly = ry / sy;
                // To pixel coords (layer origin at top-left)
                let src_x = (lx + hlw) as i64;
                let src_y = (ly + hlh) as i64;

                if src_x < 0 || src_y < 0 || src_x >= lw as i64 || src_y >= lh as i64 {
                    continue;
                }

                let src_idx = (src_y as usize * lw as usize + src_x as usize) * 4;
                if src_idx + 3 >= layer_data.len() {
                    continue;
                }

                let sr = layer_data[src_idx] as f32 / 255.0;
                let sg = layer_data[src_idx + 1] as f32 / 255.0;
                let sb = layer_data[src_idx + 2] as f32 / 255.0;
                let sa = (layer_data[src_idx + 3] as f32 / 255.0) * opacity;

                if sa <= 0.0 {
                    continue;
                }

                let dst_idx = (py * cw + px) * 4;
                let dr = buf[dst_idx] as f32 / 255.0;
                let dg = buf[dst_idx + 1] as f32 / 255.0;
                let db = buf[dst_idx + 2] as f32 / 255.0;
                let da = buf[dst_idx + 3] as f32 / 255.0;

                // Blend mode on color channels
                let br = blend_channel(dr, sr, blend_mode);
                let bg = blend_channel(dg, sg, blend_mode);
                let bb = blend_channel(db, sb, blend_mode);

                // Porter-Duff source-over compositing
                let out_a = sa + da * (1.0 - sa);
                if out_a > 0.0 {
                    let out_r = (br * sa + dr * da * (1.0 - sa)) / out_a;
                    let out_g = (bg * sa + dg * da * (1.0 - sa)) / out_a;
                    let out_b = (bb * sa + db * da * (1.0 - sa)) / out_a;
                    buf[dst_idx] = (out_r * 255.0).clamp(0.0, 255.0) as u8;
                    buf[dst_idx + 1] = (out_g * 255.0).clamp(0.0, 255.0) as u8;
                    buf[dst_idx + 2] = (out_b * 255.0).clamp(0.0, 255.0) as u8;
                    buf[dst_idx + 3] = (out_a * 255.0).clamp(0.0, 255.0) as u8;
                }
            }
        }
    }

    let img = DynamicImage::ImageRgba8(
        RgbaImage::from_raw(canvas_width, canvas_height, buf)
            .ok_or_else(|| JsError::new("Failed to create image from buffer"))?,
    );

    match format {
        "jpeg" => encode_jpeg(&img, quality.min(100) as u8),
        _ => encode_png(&img),
    }
}

#[wasm_bindgen]
pub fn decode_images_batch(
    packed: &[u8],
    offsets: &[u32],
    lengths: &[u32],
) -> Result<Vec<u8>, JsError> {
    if offsets.len() != lengths.len() {
        return Err(JsError::new("offsets and lengths must have the same length"));
    }

    let mut output = Vec::new();

    for i in 0..offsets.len() {
        let start = offsets[i] as usize;
        let len = lengths[i] as usize;
        if start + len > packed.len() {
            return Err(JsError::new(&format!("Image {i} exceeds packed buffer bounds")));
        }
        let slice = &packed[start..start + len];
        let img = decode_image(slice)?;
        let rgba = img.to_rgba8();
        let w = rgba.width();
        let h = rgba.height();
        // Write width and height as little-endian u32
        output.extend_from_slice(&w.to_le_bytes());
        output.extend_from_slice(&h.to_le_bytes());
        output.extend_from_slice(rgba.as_raw());
    }

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
