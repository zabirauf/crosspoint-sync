Pod::Spec.new do |s|
  s.name = 'ReaderToolbar'
  s.version = '1.0.0'
  s.summary = 'Native reader actions for adaptive iOS system bars'
  s.author = ''
  s.homepage = 'https://github.com/zabirauf/crosspoint-sync'
  s.platforms = { :ios => '15.1' }
  s.source = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
  s.resources = 'Resources/reader*.png'
end
