Pod::Spec.new do |s|
  s.name           = 'OrderIsland'
  s.version        = '1.0.0'
  s.summary        = 'Starts, updates and ends the "tomorrow\'s order" Live Activity.'
  s.description    = s.summary
  s.author         = 'Fooducia'
  s.homepage       = 'https://fooducia.in'
  s.license        = 'UNLICENSED'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
