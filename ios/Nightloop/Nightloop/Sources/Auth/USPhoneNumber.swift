import Foundation

enum USPhoneNumber {
    static func normalize(_ value: String) -> String? {
        let digits = value.filter(\.isNumber)
        let nationalNumber: String

        if digits.count == 10 {
            nationalNumber = digits
        } else if digits.count == 11, digits.first == "1" {
            nationalNumber = String(digits.dropFirst())
        } else {
            return nil
        }

        guard nationalNumber.first.map({ "23456789".contains($0) }) == true else {
            return nil
        }

        return "+1\(nationalNumber)"
    }
}
