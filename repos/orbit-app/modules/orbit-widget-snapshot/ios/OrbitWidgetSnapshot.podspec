Pod::Spec.new do |s|
  s.name           = 'OrbitWidgetSnapshot'
  s.version        = '0.0.1'
  s.summary        = 'Writes bounded Orbit WidgetKit snapshots to an App Group container.'
  s.author         = 'Orbit'
  s.homepage       = 'https://orbit.invalid'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.source_files   = '**/*.swift'
  s.swift_version  = '5.0'
  s.frameworks     = 'WidgetKit'
  s.dependency 'ExpoModulesCore'
end
