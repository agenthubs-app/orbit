import Foundation

@main enum WidgetReaderTombstoneTest {
  static func main() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: root) }
    let hash = String(repeating: "a", count: 64)
    let generated = "2026-10-20T08:00:00.000Z"
    let cards = ["today", "network", "secretary", "plan", "event"].map { "\"\($0)\":{\"status\":\"empty\"}" }.joined(separator: ",")
    let json = "{\"schemaVersion\":1,\"scopeHash\":\"\(hash)\",\"generatedAt\":\"\(generated)\",\"expiresAt\":\"2026-10-20T08:30:00.000Z\",\"lastUpdatedAt\":\"\(generated)\",\"timeZone\":\"Asia/Tokyo\",\"layoutRevision\":1,\"widgets\":{\(cards)}}"
    try hash.write(to: root.appendingPathComponent("authorized-scope-v1"), atomically: true, encoding: .utf8)
    try hash.write(to: root.appendingPathComponent("active-scope-v1"), atomically: true, encoding: .utf8)
    try json.write(to: root.appendingPathComponent("active-snapshot-v1.json"), atomically: true, encoding: .utf8)
    let now = SnapshotReader.date("2026-10-20T08:01:00.000Z")!
    guard case .ready = SnapshotReader.load(at: now, in: root) else { fatalError("valid snapshot must render") }
    try "revoked".write(to: root.appendingPathComponent("revoked-v1"), atomically: true, encoding: .utf8)
    guard case .empty = SnapshotReader.load(at: now, in: root) else { fatalError("tombstone must hide snapshot") }
    try FileManager.default.removeItem(at: root.appendingPathComponent("revoked-v1"))
    try FileManager.default.removeItem(at: root.appendingPathComponent("active-scope-v1"))
    guard case .empty = SnapshotReader.load(at: now, in: root) else { fatalError("missing pointer must hide snapshot") }
    print("Widget reader tombstone and missing pointer: PASS")
  }
}
