// SPDX-License-Identifier: AGPL-3.0-only
// Finding highsea servers on this network (ADR 0020, ADR 0059): Network framework's NWBrowser for
// `_highsea._tcp` with its TXT record, which carries the server's id
// (https://developer.apple.com/documentation/network/nwbrowser). A Bonjour result names a service,
// not an address, so each is resolved by opening an NWConnection to it and reading the path's
// remote endpoint, then closed. The page asks that address for the server's public info.
//
// iOS asks the person before an app may browse (TN3179). A refusal shows as the browser waiting
// with the PolicyDenied DNS-SD error (kDNSServiceErr_PolicyDenied, -65570), sent as `refused`.
import ExpoModulesCore
import Network

public class HighseaDiscoveryModule: Module {
  private var browser: NWBrowser?
  private var resolving: [NWConnection] = []
  private let queue = DispatchQueue(label: "tv.highsea.discovery")

  public func definition() -> ModuleDefinition {
    Name("HighseaDiscovery")
    Events("onFound", "onState")

    Function("start") {
      self.queue.async { self.begin() }
    }

    Function("stop") {
      self.queue.async { self.end() }
    }

    OnDestroy {
      self.queue.async { self.end() }
    }
  }

  private func begin() {
    end()
    let params = NWParameters()
    params.includePeerToPeer = false
    let b = NWBrowser(for: .bonjourWithTXTRecord(type: "_highsea._tcp", domain: nil), using: params)
    b.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        self.sendEvent("onState", ["state": "browsing"])
      case .waiting(let error), .failed(let error):
        if case .dns(let code) = error, code == -65570 {
          self.sendEvent("onState", ["state": "refused"])
        } else {
          self.sendEvent("onState", ["state": "failed", "message": "\(error)"])
        }
      default:
        break
      }
    }
    b.browseResultsChangedHandler = { [weak self] results, _ in
      for result in results { self?.resolve(result) }
    }
    browser = b
    b.start(queue: queue)
  }

  private func end() {
    browser?.cancel()
    browser = nil
    for c in resolving { c.cancel() }
    resolving.removeAll()
  }

  private func resolve(_ result: NWBrowser.Result) {
    var id = ""
    if case .bonjour(let txt) = result.metadata { id = txt["id"] ?? "" }
    var name = ""
    if case .service(let n, _, _, _) = result.endpoint { name = n }
    // IPv4 first: a link-local IPv6 address needs its zone, which a URL can't carry
    let params = NWParameters.tcp
    if let ip = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
      ip.version = .v4
    }
    let connection = NWConnection(to: result.endpoint, using: params)
    connection.stateUpdateHandler = { [weak self] state in
      guard let self else { return }
      switch state {
      case .ready:
        if case .hostPort(let host, let port) = connection.currentPath?.remoteEndpoint {
          var address = "\(host)"
          // an IPv6 literal keeps its zone out of the URL and goes in brackets
          if case .ipv6 = host {
            address = "[\(address.split(separator: "%").first ?? "")]"
          }
          self.sendEvent("onFound", [
            "id": id, "name": name, "host": address, "port": Int(port.rawValue),
          ])
        }
        connection.cancel()
      case .failed, .cancelled:
        self.resolving.removeAll { $0 === connection }
      default:
        break
      }
    }
    resolving.append(connection)
    connection.start(queue: queue)
  }
}
