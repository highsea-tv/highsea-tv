# SPDX-License-Identifier: AGPL-3.0-only
# highsea's Bonjour browser (ADR 0059), a local Expo module
# (https://docs.expo.dev/modules/get-started/#creating-the-local-expo-module).
Pod::Spec.new do |s|
  s.name           = 'HighseaDiscovery'
  s.version        = '0.0.0'
  s.summary        = 'Finds highsea servers on this network over Bonjour'
  s.author         = 'highsea'
  s.homepage       = 'https://highsea.tv'
  s.license        = 'AGPL-3.0-only'
  s.platforms      = { :ios => '16.4', :tvos => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
end
