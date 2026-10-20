import SwiftUI
import WidgetKit

private enum WidgetKind: String {
  case today = "orbit.today"
  case network = "orbit.network"
  case secretary = "orbit.secretary"
  case plan = "orbit.plan"
  case lockScore = "orbit.lock.score"
  case lockEvent = "orbit.lock.event"

  var family: WidgetFamily {
    switch self {
    case .today, .network: return .systemSmall
    case .secretary: return .systemMedium
    case .plan: return .systemLarge
    case .lockScore: return .accessoryCircular
    case .lockEvent: return .accessoryRectangular
    }
  }
}

private struct WidgetCard<Display: Decodable>: Decodable {
  let status: String
  let display: Display?
}
private struct TodayRow: Decodable { let title: String; let href: String }
private struct TodayDisplay: Decodable { let count: Int; let rows: [TodayRow] }
private struct Person: Decodable { let id: String; let name: String }
private struct NetworkDisplay: Decodable { let total: Int; let addedThisMonth: Int?; let people: [Person] }
private struct SecretaryRow: Decodable { let title: String; let reason: String?; let kind: String; let href: String }
private struct SecretaryDisplay: Decodable { let count: Int; let items: [SecretaryRow] }
private struct PlanSegment: Decodable {
  let key: String; let label: String; let allocation: Double; let earned: Double; let overflow: Double; let skipped: Bool
}
private struct PlanChance: Decodable { let label: String; let points: Double; let href: String }
private struct PlanDisplay: Decodable {
  let goal: String; let total: Double; let talked: Double; let skipped: Double
  let todayDelta: Double; let segments: [PlanSegment]; let chance: PlanChance?
}
private struct EventDisplay: Decodable {
  let title: String; let startsAt: String; let venue: String?; let meetCount: Int?; let href: String
}
private struct WidgetCards: Decodable {
  let today: WidgetCard<TodayDisplay>; let network: WidgetCard<NetworkDisplay>
  let secretary: WidgetCard<SecretaryDisplay>; let plan: WidgetCard<PlanDisplay>; let event: WidgetCard<EventDisplay>
}
private struct WidgetSnapshot: Decodable {
  let schemaVersion: Int; let scopeHash: String; let generatedAt: String; let expiresAt: String
  let lastUpdatedAt: String; let timeZone: String; let layoutRevision: Int; let widgets: WidgetCards
}

private enum SnapshotState {
  case empty
  case expired(Date)
  case ready(WidgetSnapshot, Date)
}

private enum SnapshotReader {
  static let group = "group.app.agenthubs.orbit"
  static func date(_ value: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: value) ?? ISO8601DateFormatter().date(from: value)
  }

  static func load(at now: Date) -> SnapshotState {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) else { return .empty }
    let file = container.appendingPathComponent("active-snapshot-v1.json")
    guard let authorized = try? String(contentsOf: container.appendingPathComponent("authorized-scope-v1"), encoding: .utf8),
      let active = try? String(contentsOf: container.appendingPathComponent("active-scope-v1"), encoding: .utf8),
      active == authorized, active.count == 64,
      let size = (try? FileManager.default.attributesOfItem(atPath: file.path)[.size]) as? Int,
      size <= 64 * 1024,
      let data = try? Data(contentsOf: file),
      let snapshot = try? JSONDecoder().decode(WidgetSnapshot.self, from: data),
      snapshot.schemaVersion == 1, snapshot.scopeHash == active,
      let generated = date(snapshot.generatedAt), let expires = date(snapshot.expiresAt),
      let updated = date(snapshot.lastUpdatedAt),
      generated <= now, updated >= generated, updated <= now,
      expires > generated, expires <= generated.addingTimeInterval(1800),
      let zone = TimeZone(identifier: snapshot.timeZone)
    else { return .empty }

    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = zone
    if now >= expires || !calendar.isDate(generated, inSameDayAs: now) { return .expired(updated) }
    let nextDay = calendar.date(byAdding: .day, value: 1, to: calendar.startOfDay(for: now)) ?? expires
    return .ready(snapshot, min(expires, nextDay))
  }
}

private struct OrbitEntry: TimelineEntry {
  let date: Date
  let state: SnapshotState
}
private struct OrbitProvider: TimelineProvider {
  func placeholder(in context: Context) -> OrbitEntry { OrbitEntry(date: .now, state: .empty) }
  func getSnapshot(in context: Context, completion: @escaping (OrbitEntry) -> Void) {
    completion(OrbitEntry(date: .now, state: SnapshotReader.load(at: .now)))
  }
  func getTimeline(in context: Context, completion: @escaping (Timeline<OrbitEntry>) -> Void) {
    let now = Date()
    let current = SnapshotReader.load(at: now)
    var entries = [OrbitEntry(date: now, state: current)]
    if case let .ready(snapshot, expiry) = current, let updated = SnapshotReader.date(snapshot.lastUpdatedAt) {
      entries.append(OrbitEntry(date: expiry, state: .expired(updated)))
      completion(Timeline(entries: entries, policy: .after(expiry)))
    } else {
      completion(Timeline(entries: entries, policy: .after(now.addingTimeInterval(1800))))
    }
  }
}

private struct WidgetCopy {
  let locale: Locale
  private var language: Int {
    if locale.identifier.hasPrefix("zh") { return 1 }
    if locale.identifier.hasPrefix("en") { return 2 }
    return 0
  }
  private func pick(_ ja: String, _ zh: String, _ en: String) -> String { [ja, zh, en][language] }
  var today: String { pick("今日やること", "今日待办", "Today") }
  var network: String { pick("人脈", "人脉", "Network") }
  var secretary: String { pick("秘書から", "秘书提醒", "Secretary") }
  var plan: String { pick("プラン スコア", "计划分数", "Plan score") }
  var score: String { pick("スコア", "分数", "Score") }
  var updated: String { pick("更新", "更新", "Updated") }
  var empty: String { pick("まだありません", "暂无内容", "Nothing yet") }
  var unavailable: String { pick("今は読み込めません", "暂时无法读取", "Unavailable") }
  var refresh: String { pick("Orbit を開いて更新", "打开 Orbit 更新", "Open Orbit to refresh") }
  var nextEvent: String { pick("次のイベント", "下一场活动", "Next event") }
  var people: String { pick("人", "人", "people") }
  var items: String { pick("件", "件", "items") }
  var talked: String { pick("話して", "交流", "Talked") }
  var skipped: String { pick("スキップ", "跳过", "Skipped") }
  var noLimit: String { pick("上限なし", "无上限", "No cap") }
  var chance: String { pick("今日のチャンス", "今日机会", "Today's chance") }
}

private let ink = Color(red: 0.16, green: 0.13, blue: 0.20)
private let muted = Color(red: 0.42, green: 0.38, blue: 0.46)
private let lavender = Color(red: 0.52, green: 0.38, blue: 0.64)
private let mint = Color(red: 0.37, green: 0.62, blue: 0.52)

private func safeURL(_ path: String?) -> URL? {
  guard let path, path.hasPrefix("/"), !path.hasPrefix("//"), !path.contains("\\"),
    !path.contains("://"), !path.contains(".."),
    ["/home", "/task", "/contacts", "/inbox", "/events"].contains(where: { path == $0 || path.hasPrefix($0 + "/") || path.hasPrefix($0 + "?") })
  else { return nil }
  return URL(string: "orbit://" + path)
}

private struct OrbitWidgetView: View {
  let kind: WidgetKind
  let entry: OrbitEntry
  @Environment(\.locale) private var locale
  @Environment(\.colorScheme) private var colorScheme
  private var copy: WidgetCopy { WidgetCopy(locale: locale) }

  var body: some View {
    Group {
      switch entry.state {
      case .empty: fallback(copy.empty, nil)
      case let .expired(updated): fallback(copy.refresh, updated)
      case let .ready(snapshot, _): content(snapshot)
      }
    }
    .containerBackground(for: .widget) {
      colorScheme == .dark ? Color(red: 0.13, green: 0.12, blue: 0.16) : Color(red: 0.98, green: 0.97, blue: 0.99)
    }
  }

  private func updated(_ date: Date?) -> some View {
    Group {
      if let date {
        Text("\(copy.updated) \(date.formatted(.dateTime.hour().minute().locale(locale)))")
          .font(.system(size: kind == .lockScore || kind == .lockEvent ? 8 : 10)).foregroundStyle(muted)
      }
    }
  }

  private func fallback(_ message: String, _ date: Date?) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.system(size: 12, weight: .bold))
      Spacer(minLength: 0)
      Text(message).font(.system(size: 12)).lineLimit(2)
      updated(date)
    }
    .foregroundStyle(ink).padding(kind == .lockScore || kind == .lockEvent ? 0 : 4)
    .widgetURL(safeURL("/home"))
  }

  private var title: String {
    switch kind {
    case .today: return copy.today
    case .network: return copy.network
    case .secretary: return copy.secretary
    case .plan: return copy.plan
    case .lockScore: return copy.score
    case .lockEvent: return copy.nextEvent
    }
  }

  @ViewBuilder private func content(_ snapshot: WidgetSnapshot) -> some View {
    switch kind {
    case .today: today(snapshot)
    case .network: network(snapshot)
    case .secretary: secretary(snapshot)
    case .plan: plan(snapshot)
    case .lockScore: lockScore(snapshot)
    case .lockEvent: lockEvent(snapshot)
    }
  }

  private func cardFallback(_ status: String, _ snapshot: WidgetSnapshot) -> some View {
    fallback(status == "empty" ? copy.empty : copy.unavailable, SnapshotReader.date(snapshot.lastUpdatedAt))
  }

  @ViewBuilder private func today(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.today.display, snapshot.widgets.today.status == "ready" {
      VStack(alignment: .leading, spacing: 7) {
        HStack { Text(copy.today); Spacer(); Text("\(data.count)\(copy.items)") }
          .font(.system(size: 11, weight: .bold)).foregroundStyle(muted)
        ForEach(Array(data.rows.prefix(3).enumerated()), id: \.offset) { _, row in
          HStack(spacing: 7) { Image(systemName: "circle").font(.system(size: 11)); Text(row.title).lineLimit(1) }
            .font(.system(size: 12, weight: .semibold)).foregroundStyle(ink)
        }
        Spacer(minLength: 0)
        updated(SnapshotReader.date(snapshot.lastUpdatedAt))
      }.widgetURL(safeURL("/task?seg=todo"))
    } else { cardFallback(snapshot.widgets.today.status, snapshot) }
  }

  @ViewBuilder private func network(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.network.display, snapshot.widgets.network.status == "ready" {
      VStack(alignment: .leading, spacing: 5) {
        Text(copy.network).font(.system(size: 11, weight: .bold)).foregroundStyle(muted)
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text("\(data.total)").font(.system(size: 38, weight: .bold, design: .rounded))
          if let added = data.addedThisMonth { Text("+\(added)").font(.system(size: 11, weight: .bold)).foregroundStyle(mint) }
        }.foregroundStyle(ink)
        HStack(spacing: 6) {
          ForEach(data.people.prefix(3), id: \.id) { person in
            if let id = person.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/?%#"))),
              let url = safeURL("/contacts/" + id) {
              Link(destination: url) {
                VStack(spacing: 3) {
                  Text(String(person.name.prefix(1))).font(.system(size: 14, weight: .bold)).frame(width: 29, height: 29)
                    .background(lavender.opacity(0.18), in: Circle())
                  Text(person.name.components(separatedBy: " ").first ?? person.name).font(.system(size: 9)).lineLimit(1)
                }.foregroundStyle(ink)
              }
            }
          }
        }
        Spacer(minLength: 0)
        updated(SnapshotReader.date(snapshot.lastUpdatedAt))
      }.widgetURL(safeURL("/contacts"))
    } else { cardFallback(snapshot.widgets.network.status, snapshot) }
  }

  @ViewBuilder private func secretary(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.secretary.display, snapshot.widgets.secretary.status == "ready" {
      VStack(alignment: .leading, spacing: 9) {
        HStack {
          Text("\(copy.secretary) · \(SnapshotReader.date(snapshot.lastUpdatedAt)?.formatted(.dateTime.month().day().weekday().locale(locale)) ?? "")")
          Spacer(); Text("\(data.count)\(copy.items)")
        }
          .font(.system(size: 12, weight: .bold)).foregroundStyle(muted)
        ForEach(Array(data.items.prefix(2).enumerated()), id: \.offset) { _, item in
          HStack(spacing: 9) {
            Text(item.kind == "event_pick" ? "🎯" : "⏰")
            VStack(alignment: .leading, spacing: 2) {
              Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
              if let reason = item.reason { Text(reason).font(.system(size: 10)).lineLimit(1).foregroundStyle(muted) }
            }
          }.foregroundStyle(ink)
        }
        Spacer(minLength: 0)
        updated(SnapshotReader.date(snapshot.lastUpdatedAt))
      }.widgetURL(safeURL("/inbox?filter=secretary"))
    } else { cardFallback(snapshot.widgets.secretary.status, snapshot) }
  }

  @ViewBuilder private func plan(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.plan.display, snapshot.widgets.plan.status == "ready" {
      VStack(alignment: .leading, spacing: 11) {
        Text("\(copy.plan) · \(data.goal)").font(.system(size: 12, weight: .bold)).lineLimit(1).foregroundStyle(muted)
        HStack(alignment: .firstTextBaseline, spacing: 12) {
          Text(data.total.formatted()).font(.system(size: 54, weight: .bold, design: .rounded))
          VStack(alignment: .leading) {
            Text("\(copy.talked) \(data.talked.formatted()) · \(copy.skipped) \(data.skipped.formatted())")
            Text(copy.noLimit)
            Text("\(data.todayDelta < 0 ? "" : "+")\(data.todayDelta.formatted())")
              .foregroundStyle(data.todayDelta < 0 ? Color.red : mint)
          }.font(.system(size: 11)).foregroundStyle(muted)
        }.foregroundStyle(ink)
        GeometryReader { geometry in
          HStack(spacing: 2) {
            ForEach(Array(data.segments.enumerated()), id: \.offset) { _, segment in
              let fraction = max(0, segment.allocation) / max(1, data.segments.reduce(0) { $0 + max(0, $1.allocation) })
              ZStack(alignment: .leading) {
                Color.gray.opacity(0.17)
                (segment.skipped ? lavender.opacity(0.55) : lavender)
                  .frame(width: geometry.size.width * fraction * min(1, max(0, segment.earned + segment.overflow) / max(1, segment.allocation)))
              }.frame(maxWidth: geometry.size.width * fraction).frame(height: 8).clipShape(Capsule())
            }
          }
        }.frame(height: 8)
        if let chance = data.chance {
          VStack(alignment: .leading, spacing: 4) {
            Text(copy.chance).font(.system(size: 11, weight: .bold)).foregroundStyle(muted)
            Text("\(chance.label)  \(chance.points < 0 ? "" : "+")\(chance.points.formatted())")
              .font(.system(size: 14, weight: .semibold)).lineLimit(2)
          }.padding(10).frame(maxWidth: .infinity, alignment: .leading).background(lavender.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
        }
        ForEach(Array(data.segments.prefix(3).enumerated()), id: \.offset) { _, segment in
          HStack { Text(segment.label); Spacer(); Text("\((segment.earned + segment.overflow).formatted()) / \(segment.allocation.formatted())") }
            .font(.system(size: 12, weight: .semibold)).foregroundStyle(ink)
        }
        Spacer(minLength: 0)
        updated(SnapshotReader.date(snapshot.lastUpdatedAt))
      }.widgetURL(safeURL("/task?seg=plan"))
    } else { cardFallback(snapshot.widgets.plan.status, snapshot) }
  }

  @ViewBuilder private func lockScore(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.plan.display, snapshot.widgets.plan.status == "ready" {
      ZStack {
        Circle().stroke(.primary.opacity(0.18), lineWidth: 5)
        Circle().trim(from: 0, to: min(1, max(0, data.total / 100)))
          .stroke(.primary, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
        VStack(spacing: 0) {
          Text(data.total.formatted()).font(.system(size: 18, weight: .bold))
          Text(copy.score).font(.system(size: 8, weight: .semibold))
          updated(SnapshotReader.date(snapshot.lastUpdatedAt))
        }
      }.widgetURL(safeURL("/task?seg=plan"))
    } else { cardFallback(snapshot.widgets.plan.status, snapshot) }
  }

  @ViewBuilder private func lockEvent(_ snapshot: WidgetSnapshot) -> some View {
    if let data = snapshot.widgets.event.display, snapshot.widgets.event.status == "ready" {
      VStack(alignment: .leading, spacing: 2) {
        Text(SnapshotReader.date(data.startsAt)?.formatted(.dateTime.hour().minute().locale(locale)) ?? "")
          .font(.system(size: 10, weight: .semibold))
        Text(data.title).font(.system(size: 13, weight: .bold)).lineLimit(1).privacySensitive()
        if let venue = data.venue { Text(venue).font(.system(size: 10)).lineLimit(1).privacySensitive() }
        updated(SnapshotReader.date(snapshot.lastUpdatedAt))
      }.widgetURL(safeURL(data.href) ?? safeURL("/events"))
    } else { cardFallback(snapshot.widgets.event.status, snapshot) }
  }
}

private struct OrbitWidget: Widget {
  let kind: WidgetKind
  init() { kind = .today }
  init(kind: WidgetKind) { self.kind = kind }
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind.rawValue, provider: OrbitProvider()) { entry in
      OrbitWidgetView(kind: kind, entry: entry)
    }
    .configurationDisplayName({
      let copy = WidgetCopy(locale: .current)
      switch kind {
      case .today: return copy.today
      case .network: return copy.network
      case .secretary: return copy.secretary
      case .plan: return copy.plan
      case .lockScore: return copy.score
      case .lockEvent: return copy.nextEvent
      }
    }())
    .description("Orbit")
    .supportedFamilies([kind.family])
  }
}

@main struct OrbitWidgetBundle: WidgetBundle {
  var body: some Widget {
    OrbitWidget(kind: .today)
    OrbitWidget(kind: .network)
    OrbitWidget(kind: .secretary)
    OrbitWidget(kind: .plan)
    OrbitWidget(kind: .lockScore)
    OrbitWidget(kind: .lockEvent)
  }
}
