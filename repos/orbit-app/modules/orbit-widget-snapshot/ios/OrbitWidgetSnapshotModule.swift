import ExpoModulesCore
import Foundation
import WidgetKit

private final class WidgetSnapshotStore {
  static let shared = WidgetSnapshotStore()
  private let queue = DispatchQueue(label: "app.agenthubs.orbit.widget-snapshot")
  private let groupID = "group.app.agenthubs.orbit"

  private func container() throws -> URL {
    guard let url = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) else {
      throw NSError(domain: "OrbitWidgetSnapshot", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group container unavailable"])
    }
    return url
  }

  private func file(_ name: String, in container: URL) -> URL { container.appendingPathComponent(name) }
  private func remove(_ name: String, in container: URL) throws {
    let url = file(name, in: container)
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }
  private func validHash(_ value: String) -> Bool {
    value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }

  func isAvailable() -> Bool { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupID) != nil }

  func activate(_ scopeHash: String) throws {
    try queue.sync {
      guard validHash(scopeHash) else { throw NSError(domain: "OrbitWidgetSnapshot", code: 2) }
      let root = try container()
      let authorizedURL = file("authorized-scope-v1", in: root)
      if (try? String(contentsOf: authorizedURL, encoding: .utf8)) == scopeHash { return }
      // Fail closed before changing owner; a late write from the prior owner cannot reactivate it.
      try remove("active-scope-v1", in: root)
      try remove("active-snapshot-v1.json", in: root)
      try scopeHash.write(to: authorizedURL, atomically: true, encoding: .utf8)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  func clear() throws {
    try queue.sync {
      let root = try container()
      try remove("active-scope-v1", in: root)
      try remove("authorized-scope-v1", in: root)
      try remove("active-snapshot-v1.json", in: root)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }

  func write(_ json: String) throws {
    try queue.sync {
      guard let data = json.data(using: .utf8), data.count <= 64 * 1024,
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
        Set(object.keys) == Set(["schemaVersion", "scopeHash", "generatedAt", "expiresAt", "lastUpdatedAt", "timeZone", "layoutRevision", "widgets"]),
        object["schemaVersion"] as? Int == 1,
        let scopeHash = object["scopeHash"] as? String, validHash(scopeHash)
      else { throw NSError(domain: "OrbitWidgetSnapshot", code: 3) }
      let root = try container()
      guard (try? String(contentsOf: file("authorized-scope-v1", in: root), encoding: .utf8)) == scopeHash else {
        throw NSError(domain: "OrbitWidgetSnapshot", code: 4, userInfo: [NSLocalizedDescriptionKey: "Widget scope changed"])
      }
      // The active pointer is written last. A crash during replacement leaves no mixed-account frame.
      try data.write(to: file("active-snapshot-v1.json", in: root), options: .atomic)
      try scopeHash.write(to: file("active-scope-v1", in: root), atomically: true, encoding: .utf8)
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}

public final class OrbitWidgetSnapshotModule: Module {
  public func definition() -> ModuleDefinition {
    Name("OrbitWidgetSnapshot")
    AsyncFunction("containerAvailable") { WidgetSnapshotStore.shared.isAvailable() }
    AsyncFunction("activateScope") { (scopeHash: String) throws in
      try WidgetSnapshotStore.shared.activate(scopeHash)
    }
    AsyncFunction("clearSnapshot") { () throws in
      try WidgetSnapshotStore.shared.clear()
    }
    AsyncFunction("writeSnapshot") { (json: String) throws in
      try WidgetSnapshotStore.shared.write(json)
    }
  }
}
