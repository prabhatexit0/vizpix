use image::imageops::FilterType;
use image::{DynamicImage, ImageReader, Rgba, RgbaImage};
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
        0 => top,                              // normal
        1 => base * top,                       // multiply
        2 => 1.0 - (1.0 - base) * (1.0 - top), // screen
        3 => {
            // overlay
            if base < 0.5 {
                2.0 * base * top
            } else {
                1.0 - 2.0 * (1.0 - base) * (1.0 - top)
            }
        }
        4 => base.min(top), // darken
        5 => base.max(top), // lighten
        6 => {
            // color-dodge
            if top >= 1.0 {
                1.0
            } else {
                (base / (1.0 - top)).min(1.0)
            }
        }
        7 => {
            // color-burn
            if top <= 0.0 {
                0.0
            } else {
                (1.0 - (1.0 - base) / top).max(0.0)
            }
        }
        8 => {
            // hard-light
            if top < 0.5 {
                2.0 * base * top
            } else {
                1.0 - 2.0 * (1.0 - base) * (1.0 - top)
            }
        }
        9 => {
            // soft-light
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
        10 => (base - top).abs(),            // difference
        11 => base + top - 2.0 * base * top, // exclusion
        _ => top,                            // fallback to normal
    }
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
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
        let corners = [(-hlw, -hlh), (hlw, -hlh), (hlw, hlh), (-hlw, hlh)];

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
        return Err(JsError::new(
            "offsets and lengths must have the same length",
        ));
    }

    let mut output = Vec::new();

    for i in 0..offsets.len() {
        let start = offsets[i] as usize;
        let len = lengths[i] as usize;
        if start + len > packed.len() {
            return Err(JsError::new(&format!(
                "Image {i} exceeds packed buffer bounds"
            )));
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
pub fn crop_image(
    input: &[u8],
    x: u32,
    y: u32,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, JsError> {
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
pub fn adjust_image(
    input: &[u8],
    brightness: f32,
    contrast: f32,
    saturation: f32,
) -> Result<Vec<u8>, JsError> {
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
pub fn resize_to_fit(input: &[u8], max_width: u32, max_height: u32) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let (w, h) = (img.width(), img.height());
    if w <= max_width && h <= max_height {
        return Ok(input.to_vec());
    }
    let scale = (max_width as f64 / w as f64).min(max_height as f64 / h as f64);
    let nw = ((w as f64 * scale).round() as u32).max(1);
    let nh = ((h as f64 * scale).round() as u32).max(1);
    let resized = img.resize(nw, nh, FilterType::Lanczos3);
    encode_png(&resized)
}

// --- Blur helpers ---

fn box_blur_pass(src: &[f32], dst: &mut [f32], w: usize, h: usize, radius: usize, channels: usize) {
    let r = radius as f32;
    let diam = 2 * radius + 1;
    let inv = 1.0 / diam as f32;

    // Horizontal pass: src -> dst
    for y in 0..h {
        for c in 0..channels {
            let mut acc = 0.0f32;
            // seed accumulator with [-radius, radius]
            for ix in 0..diam {
                let x = (ix as isize - radius as isize).clamp(0, w as isize - 1) as usize;
                acc += src[(y * w + x) * channels + c];
            }
            dst[(y * w) * channels + c] = acc * inv;
            for x in 1..w {
                let add_x = (x as isize + r as isize).min(w as isize - 1) as usize;
                let rem_x = (x as isize - r as isize - 1).max(0) as usize;
                acc += src[(y * w + add_x) * channels + c] - src[(y * w + rem_x) * channels + c];
                dst[(y * w + x) * channels + c] = acc * inv;
            }
        }
    }

    // Vertical pass: dst -> src (reuse src as output)
    let tmp = dst.to_vec();
    for x in 0..w {
        for c in 0..channels {
            let mut acc = 0.0f32;
            for iy in 0..diam {
                let y = (iy as isize - radius as isize).clamp(0, h as isize - 1) as usize;
                acc += tmp[(y * w + x) * channels + c];
            }
            dst[x * channels + c] = acc * inv;
            for y in 1..h {
                let add_y = (y as isize + r as isize).min(h as isize - 1) as usize;
                let rem_y = (y as isize - r as isize - 1).max(0) as usize;
                acc += tmp[(add_y * w + x) * channels + c] - tmp[(rem_y * w + x) * channels + c];
                dst[(y * w + x) * channels + c] = acc * inv;
            }
        }
    }
}

fn build_gaussian_kernel(radius: usize) -> Vec<f32> {
    let sigma = (radius as f32 / 3.0).max(0.3);
    let size = 2 * radius + 1;
    let mut kernel = vec![0.0f32; size];
    let mut sum = 0.0f32;
    for (i, k) in kernel.iter_mut().enumerate().take(size) {
        let x = i as f32 - radius as f32;
        let val = (-x * x / (2.0 * sigma * sigma)).exp();
        *k = val;
        sum += val;
    }
    for v in kernel.iter_mut() {
        *v /= sum;
    }
    kernel
}

fn convolve_horizontal(
    src: &[f32],
    dst: &mut [f32],
    w: usize,
    h: usize,
    channels: usize,
    kernel: &[f32],
) {
    let radius = kernel.len() / 2;
    for y in 0..h {
        for x in 0..w {
            for c in 0..channels {
                let mut acc = 0.0f32;
                for (k, &kv) in kernel.iter().enumerate() {
                    let sx = (x as isize + k as isize - radius as isize).clamp(0, w as isize - 1)
                        as usize;
                    acc += src[(y * w + sx) * channels + c] * kv;
                }
                dst[(y * w + x) * channels + c] = acc;
            }
        }
    }
}

fn convolve_vertical(
    src: &[f32],
    dst: &mut [f32],
    w: usize,
    h: usize,
    channels: usize,
    kernel: &[f32],
) {
    let radius = kernel.len() / 2;
    for y in 0..h {
        for x in 0..w {
            for c in 0..channels {
                let mut acc = 0.0f32;
                for (k, &kv) in kernel.iter().enumerate() {
                    let sy = (y as isize + k as isize - radius as isize).clamp(0, h as isize - 1)
                        as usize;
                    acc += src[(sy * w + x) * channels + c] * kv;
                }
                dst[(y * w + x) * channels + c] = acc;
            }
        }
    }
}

fn gaussian_blur_f32(pixels: &mut [f32], w: usize, h: usize, channels: usize, radius: usize) {
    let kernel = build_gaussian_kernel(radius);
    let len = pixels.len();
    let mut tmp = vec![0.0f32; len];
    convolve_horizontal(pixels, &mut tmp, w, h, channels, &kernel);
    convolve_vertical(&tmp, pixels, w, h, channels, &kernel);
}

#[wasm_bindgen]
pub fn apply_blur(input: &[u8], radius: u32, blur_type: &str) -> Result<Vec<u8>, JsError> {
    if radius == 0 {
        return Ok(input.to_vec());
    }
    let img = decode_image(input)?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);
    let raw = rgba.as_raw();

    let mut pixels: Vec<f32> = raw.iter().map(|&b| b as f32).collect();
    let r = radius as usize;

    match blur_type {
        "box" => {
            let mut tmp = vec![0.0f32; pixels.len()];
            // Three-pass box blur approximates Gaussian
            box_blur_pass(&pixels, &mut tmp, w, h, r, 4);
            pixels.copy_from_slice(&tmp);
            box_blur_pass(&pixels, &mut tmp, w, h, r, 4);
            pixels.copy_from_slice(&tmp);
            box_blur_pass(&pixels, &mut tmp, w, h, r, 4);
            pixels.copy_from_slice(&tmp);
        }
        _ => {
            gaussian_blur_f32(&mut pixels, w, h, 4, r);
        }
    }

    let out: Vec<u8> = pixels.iter().map(|&v| v.clamp(0.0, 255.0) as u8).collect();
    let result = RgbaImage::from_raw(w as u32, h as u32, out)
        .ok_or_else(|| JsError::new("Failed to create blurred image"))?;
    encode_png(&DynamicImage::ImageRgba8(result))
}

#[wasm_bindgen]
pub fn apply_sharpen(
    input: &[u8],
    amount: f32,
    radius: u32,
    threshold: u32,
) -> Result<Vec<u8>, JsError> {
    if amount == 0.0 || radius == 0 {
        return Ok(input.to_vec());
    }
    let img = decode_image(input)?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);
    let raw = rgba.as_raw();

    let original: Vec<f32> = raw.iter().map(|&b| b as f32).collect();
    let mut blurred = original.clone();
    gaussian_blur_f32(&mut blurred, w, h, 4, radius as usize);

    let thresh = threshold as f32;
    let out: Vec<u8> = original
        .iter()
        .zip(blurred.iter())
        .enumerate()
        .map(|(i, (&orig, &blur))| {
            // Don't sharpen alpha channel
            if i % 4 == 3 {
                return orig.clamp(0.0, 255.0) as u8;
            }
            let diff = orig - blur;
            if diff.abs() < thresh {
                orig.clamp(0.0, 255.0) as u8
            } else {
                (orig + amount * diff).clamp(0.0, 255.0) as u8
            }
        })
        .collect();

    let result = RgbaImage::from_raw(w as u32, h as u32, out)
        .ok_or_else(|| JsError::new("Failed to create sharpened image"))?;
    encode_png(&DynamicImage::ImageRgba8(result))
}

// --- Histogram ---

#[wasm_bindgen]
pub fn compute_histogram(input: &[u8]) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let rgba = img.to_rgba8();

    let mut r_hist = [0u32; 256];
    let mut g_hist = [0u32; 256];
    let mut b_hist = [0u32; 256];

    for pixel in rgba.pixels() {
        let Rgba([r, g, b, _]) = *pixel;
        r_hist[r as usize] += 1;
        g_hist[g as usize] += 1;
        b_hist[b as usize] += 1;
    }

    // Pack as little-endian: 3 × 256 × 4 = 3072 bytes
    let mut out = Vec::with_capacity(3072);
    for v in &r_hist {
        out.extend_from_slice(&v.to_le_bytes());
    }
    for v in &g_hist {
        out.extend_from_slice(&v.to_le_bytes());
    }
    for v in &b_hist {
        out.extend_from_slice(&v.to_le_bytes());
    }
    Ok(out)
}

// --- Color Quantization (median-cut) ---

fn color_dist_sq(a: [u8; 3], b: [u8; 3]) -> u32 {
    let dr = a[0] as i32 - b[0] as i32;
    let dg = a[1] as i32 - b[1] as i32;
    let db = a[2] as i32 - b[2] as i32;
    (dr * dr + dg * dg + db * db) as u32
}

fn bucket_mean(pixels: &[[u8; 3]]) -> [u8; 3] {
    if pixels.is_empty() {
        return [0, 0, 0];
    }
    let (mut sr, mut sg, mut sb) = (0u64, 0u64, 0u64);
    for p in pixels {
        sr += p[0] as u64;
        sg += p[1] as u64;
        sb += p[2] as u64;
    }
    let n = pixels.len() as u64;
    [(sr / n) as u8, (sg / n) as u8, (sb / n) as u8]
}

fn median_cut(pixels: &[[u8; 3]], num_colors: usize) -> Vec<[u8; 3]> {
    if pixels.is_empty() || num_colors == 0 {
        return vec![[0, 0, 0]];
    }

    let mut buckets: Vec<Vec<[u8; 3]>> = vec![pixels.to_vec()];

    while buckets.len() < num_colors {
        // Find bucket with greatest range
        let mut best_idx = 0;
        let mut best_range = 0u32;
        for (i, bucket) in buckets.iter().enumerate() {
            if bucket.len() < 2 {
                continue;
            }
            for ch in 0..3 {
                let min = bucket.iter().map(|p| p[ch]).min().unwrap_or(0);
                let max = bucket.iter().map(|p| p[ch]).max().unwrap_or(0);
                let range = (max - min) as u32;
                if range > best_range {
                    best_range = range;
                    best_idx = i;
                }
            }
        }

        if best_range == 0 {
            break;
        }

        let bucket = &buckets[best_idx];
        // Find channel with greatest range in this bucket
        let mut split_ch = 0;
        let mut max_range = 0u8;
        for ch in 0..3 {
            let min = bucket.iter().map(|p| p[ch]).min().unwrap_or(0);
            let max = bucket.iter().map(|p| p[ch]).max().unwrap_or(0);
            if max - min > max_range {
                max_range = max - min;
                split_ch = ch;
            }
        }

        let mut to_split = buckets.swap_remove(best_idx);
        to_split.sort_by_key(|p| p[split_ch]);
        let mid = to_split.len() / 2;
        let right = to_split.split_off(mid);
        buckets.push(to_split);
        buckets.push(right);
    }

    buckets.iter().map(|b| bucket_mean(b)).collect()
}

#[wasm_bindgen]
pub fn quantize_colors(input: &[u8], num_colors: u32) -> Result<Vec<u8>, JsError> {
    let img = decode_image(input)?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width(), rgba.height());

    // Collect opaque pixel RGB values for palette computation
    let mut samples: Vec<[u8; 3]> = Vec::new();
    for pixel in rgba.pixels() {
        let Rgba([r, g, b, a]) = *pixel;
        if a > 0 {
            samples.push([r, g, b]);
        }
    }

    let palette = median_cut(&samples, num_colors as usize);

    // Map each pixel to nearest palette color
    let mut out_rgba = rgba.clone();
    for pixel in out_rgba.pixels_mut() {
        let Rgba([r, g, b, a]) = *pixel;
        if a == 0 {
            continue;
        }
        let src = [r, g, b];
        let mut best = palette[0];
        let mut best_dist = color_dist_sq(src, best);
        for &color in &palette[1..] {
            let d = color_dist_sq(src, color);
            if d < best_dist {
                best_dist = d;
                best = color;
            }
        }
        *pixel = Rgba([best[0], best[1], best[2], a]);
    }

    encode_png(&DynamicImage::ImageRgba8(
        RgbaImage::from_raw(w, h, out_rgba.into_raw())
            .ok_or_else(|| JsError::new("Failed to create quantized image"))?,
    ))
}
