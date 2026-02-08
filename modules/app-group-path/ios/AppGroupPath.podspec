Pod::Spec.new do |s|
  s.name           = 'AppGroupPath'
  s.version        = '1.0.0'
  s.summary        = 'Expo module to get App Group container path'
  s.description    = 'Exposes the iOS App Group container path to JavaScript'
  s.author         = ''
  s.homepage       = 'https://github.com/zabirauf/zync'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,mm,swift,cpp}'
end
