import Foundation
import Contacts

struct PhoneEntry: Codable {
    let numberRaw: String
}

struct PersonEntry: Codable {
    let name: String
    let phones: [PhoneEntry]
}

func displayName(_ c: CNContact) -> String {
    let parts = [c.givenName, c.middleName, c.familyName].filter { !$0.isEmpty }
    if !parts.isEmpty { return parts.joined(separator: " ") }
    if !c.organizationName.isEmpty { return c.organizationName }
    return "Unknown"
}

let store = CNContactStore()
let sema = DispatchSemaphore(value: 0)
store.requestAccess(for: .contacts) { granted, err in
    sema.signal()
}
sema.wait()

let keysToFetch: [CNKeyDescriptor] = [
    CNContactGivenNameKey as CNKeyDescriptor,
    CNContactMiddleNameKey as CNKeyDescriptor,
    CNContactFamilyNameKey as CNKeyDescriptor,
    CNContactOrganizationNameKey as CNKeyDescriptor,
    CNContactPhoneNumbersKey as CNKeyDescriptor
]

let request = CNContactFetchRequest(keysToFetch: keysToFetch)
var results: [PersonEntry] = []

do {
    try store.enumerateContacts(with: request) { contact, _ in
        let name = displayName(contact)
        let phones = contact.phoneNumbers.map { labeled in
            PhoneEntry(numberRaw: labeled.value.stringValue)
        }
        if !phones.isEmpty {
            results.append(PersonEntry(name: name, phones: phones))
        }
    }
    let data = try JSONEncoder().encode(results)
    FileHandle.standardOutput.write(data)
} catch {
    fputs("ERROR: \(error)\n", stderr)
    exit(1)
}

