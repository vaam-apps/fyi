use rand::RngExt;

/// Generate a random, URL-safe slug with at least `min_len` characters.
///
/// The slug is hexadecimal; for example "a3f9b2".
pub fn generate_slug(min_len: usize) -> String {
    let min_len = min_len.max(6);
    let bytes_len = min_len.div_ceil(2);
    let mut buf = vec![0u8; bytes_len];
    rand::rng().fill(buf.as_mut_slice());

    let mut slug = String::with_capacity(bytes_len * 2);
    for b in buf {
        slug.push_str(&format!("{:02x}", b));
    }
    slug
}
