/// A video is labeled AI when it has enough independent reports.
/// Single reports are easy to spam, so we require a small minimum.
pub fn compute_is_ai(report_count: i32) -> bool {
    report_count >= 3
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_reports() {
        assert!(!compute_is_ai(0));
    }

    #[test]
    fn below_threshold() {
        assert!(!compute_is_ai(1));
        assert!(!compute_is_ai(2));
    }

    #[test]
    fn at_threshold() {
        assert!(compute_is_ai(3));
    }

    #[test]
    fn above_threshold() {
        assert!(compute_is_ai(10));
        assert!(compute_is_ai(100));
    }
}
