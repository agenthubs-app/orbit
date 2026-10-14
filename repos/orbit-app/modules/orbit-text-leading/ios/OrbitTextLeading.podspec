Pod::Spec.new do |s|
  s.name           = 'OrbitTextLeading'
  s.version        = '0.0.1'
  s.summary        = 'Keeps RN text lines with a fixed lineHeight from growing by CJK font leading (iOS).'
  s.author         = 'Orbit'
  s.homepage       = 'https://orbit.invalid'
  s.license        = { :type => 'UNLICENSED' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.source_files   = '**/*.{h,m}'
  s.frameworks     = 'UIKit'
end
