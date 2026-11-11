use hmac::{Hmac, Mac};
use rand::{RngCore, rngs::OsRng};
use sha1::Sha1;
use std::time::{SystemTime, UNIX_EPOCH};

type HmacSha1 = Hmac<Sha1>;
const BASE32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

pub fn generate_secret() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    base32_encode(&bytes)
}

pub fn verify_totp(secret: &str, code: &str) -> bool {
    if code.len() != 6 || !code.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    let Ok(secret_bytes) = base32_decode(secret) else {
        return false;
    };
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let step = now / 30;
    [step.saturating_sub(1), step, step.saturating_add(1)]
        .iter()
        .filter_map(|step| hotp(&secret_bytes, *step, 6))
        .any(|expected| constant_time_eq(expected.as_bytes(), code.as_bytes()))
}

fn hotp(secret: &[u8], counter: u64, digits: u32) -> Option<String> {
    let mut mac = HmacSha1::new_from_slice(secret).ok()?;
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = usize::from(digest[digest.len() - 1] & 0x0f);
    let binary = (u32::from(digest[offset] & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);
    let modulo = 10u32.checked_pow(digits)?;
    Some(format!("{:0width$}", binary % modulo, width = digits as usize))
}

fn base32_encode(input: &[u8]) -> String {
    let mut output = String::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;
    for byte in input {
        buffer = (buffer << 8) | u32::from(*byte);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            output.push(BASE32[((buffer >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        output.push(BASE32[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    output
}

fn base32_decode(input: &str) -> Result<Vec<u8>, ()> {
    let mut output = Vec::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;
    for byte in input.bytes().filter(|byte| *byte != b'=') {
        let value = BASE32
            .iter()
            .position(|candidate| candidate.eq_ignore_ascii_case(&byte))
            .ok_or(())? as u32;
        buffer = (buffer << 5) | value;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            output.push((buffer >> bits) as u8);
        }
    }
    Ok(output)
}

fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0u8, |diff, (left, right)| diff | (left ^ right))
        == 0
}

#[cfg(test)]
mod tests {
    use super::{base32_decode, base32_encode, hotp};

    #[test]
    fn base32_round_trips() {
        let input = b"Sahel MFA test";
        assert_eq!(base32_decode(&base32_encode(input)).unwrap(), input);
    }

    #[test]
    fn sha1_totp_matches_rfc_6238_vector() {
        let secret = b"12345678901234567890";
        assert_eq!(hotp(secret, 1, 8).as_deref(), Some("94287082"));
    }
}