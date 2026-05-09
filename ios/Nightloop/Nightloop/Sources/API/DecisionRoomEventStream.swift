import Foundation

enum DecisionRoomEventStreamState: Equatable {
    case idle
    case connecting
    case open
    case reconnecting
    case stopped
}

struct DecisionRoomEventStreamReconnectPolicy {
    static func stateAfterDisconnect(isCancelled: Bool) -> DecisionRoomEventStreamState? {
        isCancelled ? nil : .reconnecting
    }

    static func shouldDelayBeforeReconnect(isCancelled: Bool) -> Bool {
        !isCancelled
    }
}

struct DecisionRoomSSEParser {
    static func parse(block: String) throws -> DecisionRoomEvent? {
        try parse(lines: block.components(separatedBy: .newlines))
    }

    static func parse(lines: [String]) throws -> DecisionRoomEvent? {
        var dataLines: [String] = []

        for rawLine in lines {
            guard !rawLine.isEmpty, !rawLine.hasPrefix(":") else {
                continue
            }

            let fieldAndValue = rawLine.split(separator: ":", maxSplits: 1, omittingEmptySubsequences: false)
            guard fieldAndValue.first == "data" else {
                continue
            }

            var value = fieldAndValue.count > 1 ? String(fieldAndValue[1]) : ""
            if value.hasPrefix(" ") {
                value.removeFirst()
            }
            dataLines.append(value)
        }

        guard !dataLines.isEmpty else {
            return nil
        }

        let data = Data(dataLines.joined(separator: "\n").utf8)
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(DecisionRoomEvent.self, from: data)
    }
}

final class DecisionRoomEventStream {
    typealias EventHandler = (DecisionRoomEvent) -> Void
    typealias StateHandler = (DecisionRoomEventStreamState) -> Void

    private let apiClient: NightloopAPIClient
    private let session: URLSession
    private let reconnectDelayNanoseconds: UInt64
    private var task: Task<Void, Never>?

    init(
        apiClient: NightloopAPIClient,
        session: URLSession = .shared,
        reconnectDelayNanoseconds: UInt64 = 1_500_000_000
    ) {
        self.apiClient = apiClient
        self.session = session
        self.reconnectDelayNanoseconds = reconnectDelayNanoseconds
    }

    func start(
        sessionID: String,
        bearerToken: String,
        onEvent: @escaping EventHandler,
        onState: @escaping StateHandler
    ) {
        stop()

        task = Task {
            while !Task.isCancelled {
                onState(.connecting)

                do {
                    var request = try apiClient.makeRequest(
                        path: "decision-sessions/\(sessionID)/events",
                        bearerToken: bearerToken
                    )
                    request.setValue("text/event-stream", forHTTPHeaderField: "Accept")

                    let (bytes, response) = try await session.bytes(for: request)
                    guard let httpResponse = response as? HTTPURLResponse else {
                        throw NightloopAPIError.transport(statusCode: -1, message: "No HTTP response was returned.")
                    }
                    guard (200..<300).contains(httpResponse.statusCode) else {
                        throw NightloopAPIError.transport(statusCode: httpResponse.statusCode, message: "SSE stream failed.")
                    }

                    onState(.open)
                    try await read(bytes: bytes, onEvent: onEvent)
                    if let reconnectState = DecisionRoomEventStreamReconnectPolicy.stateAfterDisconnect(isCancelled: Task.isCancelled) {
                        onState(reconnectState)
                        if DecisionRoomEventStreamReconnectPolicy.shouldDelayBeforeReconnect(isCancelled: Task.isCancelled) {
                            try? await Task.sleep(nanoseconds: reconnectDelayNanoseconds)
                        }
                    }
                } catch is CancellationError {
                    break
                } catch {
                    guard let reconnectState = DecisionRoomEventStreamReconnectPolicy.stateAfterDisconnect(isCancelled: Task.isCancelled) else {
                        continue
                    }
                    onState(reconnectState)
                    if DecisionRoomEventStreamReconnectPolicy.shouldDelayBeforeReconnect(isCancelled: Task.isCancelled) {
                        try? await Task.sleep(nanoseconds: reconnectDelayNanoseconds)
                    }
                }
            }

            onState(.stopped)
        }
    }

    func stop() {
        task?.cancel()
        task = nil
    }

    private func read(
        bytes: URLSession.AsyncBytes,
        onEvent: @escaping EventHandler
    ) async throws {
        var lines: [String] = []

        for try await line in bytes.lines {
            if Task.isCancelled {
                throw CancellationError()
            }

            if line.isEmpty {
                if let event = try DecisionRoomSSEParser.parse(lines: lines) {
                    onEvent(event)
                }
                lines.removeAll(keepingCapacity: true)
            } else {
                lines.append(line)
            }
        }

        if let event = try DecisionRoomSSEParser.parse(lines: lines) {
            onEvent(event)
        }
    }
}
