const state = {
  asset: null,
  image: null,
  regions: [],
  drawing: null,
  sourceFile: null,
  resultUrl: null,
  processing: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const homeView = $('#homeView');
const toolView = $('#toolView');
const editingModule = $('#editingModule');
const videoInput = $('#videoInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const assetThumbLetter = $('#assetThumbLetter');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const frameCanvas = $('#frameCanvas');
const canvasWrap = $('#canvasWrap');
const zonesList = $('#zonesList');
const zonesEmpty = $('#zonesEmpty');
const presetButton = $('#presetButton');
const topPresetButton = $('#topPresetButton');
const clearButton = $('#clearButton');
const processButton = $('#processButton');
const previewStatus = $('#previewStatus');
const frameReadout = $('#frameReadout');
const strengthSlider = $('#strengthSlider');
const strengthValue = $('#strengthValue');
const processingCard = $('#processingCard');
const processingMessage = $('#processingMessage');
const processingTitle = $('#processingTitle');
const progressBar = $('#progressBar');
const progressValue = $('#progressValue');
const resultCard = $('#resultCard');
const resultVideo = $('#resultVideo');
const resultMeta = $('#resultMeta');
const downloadButton = $('#downloadButton');
const languageButton = $('#languageButton');
const currentLanguage = $('#currentLanguage');
const languageModal = $('#languageModal');
const languageClose = $('#languageClose');
const languageSearch = $('#languageSearch');
const languageGrid = $('#languageGrid');
const languageEmpty = $('#languageEmpty');
const languageOptions = $$('.language-option');
const toast = $('#toast');
const ctx = frameCanvas.getContext('2d');

let toastTimer;
let activeLanguageCode = 'EN';

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

const ENGLISH_TRANSLATIONS = {
  navVideo: 'Video Tools', signIn: 'Sign In', homeTagline: 'Simple online tools for video, images, and file conversion', videoTools: 'Video Tools', imageTools: 'Image Tools', backToTools: 'Back to all tools', removeLogo: 'Remove Logo from Video',
  toolTitle: 'Remove Logo from Video', toolSubtitle: 'Easily remove logos and watermarks from video files online', chooseFile: 'Choose File', dropFile: 'or drop a file here',
  stepUpload: 'Upload video', stepMark: 'Mark watermark', stepDownload: 'Download result', stepTwo: 'Step 2', selectArea: 'Select the watermark area', readyToMark: 'Ready to mark', uploadToPreview: 'Upload a video to see its preview', dragToMark: 'Click and drag on the frame to mark an area',
  markWatermark: 'Mark the watermark', drawEveryPosition: 'Draw a box around every position', lowerCorners: 'Lower corners', topCorners: 'Top corners', clearAll: 'Clear all', selectionsHere: 'Selections will appear here', fixedSelections: 'Selections stay fixed across the full video.',
  chooseFinish: 'Choose a finish', leastAggressive: 'Use the least aggressive option', reconstruct: 'Reconstruct', cleanBackgrounds: 'Best for clean backgrounds', soften: 'Soften', subtleBlur: 'Subtle blur over the mark', pixelate: 'Pixelate', unreadable: 'Make the area unreadable', maskExpansion: 'Mask expansion', precise: 'Precise', moreCoverage: 'More coverage', cleanVideo: 'Clean this video',
  legalNote: 'Use this only on videos you own or have permission to edit. Original audio is restored when available.', cleaningVideo: 'Cleaning your video', preparingFrames: 'Preparing frames…', cleanedReady: 'Cleaned video ready', exportReady: 'Your export is ready to review.', downloadMp4: 'Download MP4', languageTitle: 'Language', search: 'Search', noLanguages: 'No languages found', translationError: 'Found a translation error?', letUsKnow: 'Let us know', footerTagline: 'Online tools for video, images, and file conversion'
};

const TRANSLATIONS = {
  EN: ENGLISH_TRANSLATIONS,
  ES: { ...ENGLISH_TRANSLATIONS, navVideo: 'Herramientas de vídeo', signIn: 'Iniciar sesión', homeTagline: 'Herramientas online sencillas para vídeo, imágenes y conversión de archivos', videoTools: 'Herramientas de vídeo', removeLogo: 'Eliminar logotipo del vídeo', toolTitle: 'Eliminar logotipo del vídeo', toolSubtitle: 'Elimina fácilmente logotipos y marcas de agua de tus vídeos', chooseFile: 'Elegir archivo', dropFile: 'o suelta un archivo aquí', stepUpload: 'Subir vídeo', stepMark: 'Marcar marca de agua', stepDownload: 'Descargar resultado', stepTwo: 'Paso 2', selectArea: 'Selecciona el área de la marca de agua', readyToMark: 'Listo para marcar', uploadToPreview: 'Sube un vídeo para ver su vista previa', dragToMark: 'Haz clic y arrastra para marcar un área', markWatermark: 'Marca la marca de agua', drawEveryPosition: 'Dibuja un recuadro en cada posición', lowerCorners: 'Esquinas inferiores', topCorners: 'Esquinas superiores', clearAll: 'Borrar todo', selectionsHere: 'Las selecciones aparecerán aquí', fixedSelections: 'Las selecciones permanecen fijas durante todo el vídeo.', chooseFinish: 'Elige un acabado', leastAggressive: 'Usa la opción menos agresiva', reconstruct: 'Reconstruir', cleanBackgrounds: 'Mejor para fondos limpios', soften: 'Suavizar', subtleBlur: 'Desenfoque sutil sobre la marca', pixelate: 'Pixelar', unreadable: 'Haz que el área sea ilegible', maskExpansion: 'Expansión de máscara', precise: 'Preciso', moreCoverage: 'Más cobertura', cleanVideo: 'Limpiar este vídeo', legalNote: 'Usa esto solo en vídeos que poseas o tengas permiso para editar. El audio original se restaura cuando está disponible.', cleaningVideo: 'Limpiando tu vídeo', preparingFrames: 'Preparando fotogramas…', cleanedReady: 'Vídeo limpio listo', exportReady: 'Tu exportación está lista para revisar.', downloadMp4: 'Descargar MP4', languageTitle: 'Idioma', search: 'Buscar', noLanguages: 'No se encontraron idiomas', translationError: '¿Encontraste un error de traducción?', letUsKnow: 'Avísanos', footerTagline: 'Herramientas online para vídeo, imágenes y conversión de archivos' },
  PT: { ...ENGLISH_TRANSLATIONS, navVideo: 'Ferramentas de vídeo', signIn: 'Entrar', homeTagline: 'Ferramentas online simples para vídeo, imagens e conversão de arquivos', videoTools: 'Ferramentas de vídeo', removeLogo: 'Remover logotipo do vídeo', toolTitle: 'Remover logotipo do vídeo', toolSubtitle: 'Remova logotipos e marcas d’água dos seus vídeos', chooseFile: 'Escolher arquivo', dropFile: 'ou arraste um arquivo aqui', stepUpload: 'Enviar vídeo', stepMark: 'Marcar marca d’água', stepDownload: 'Baixar resultado', selectArea: 'Selecione a área da marca d’água', readyToMark: 'Pronto para marcar', markWatermark: 'Marcar a marca d’água', lowerCorners: 'Cantos inferiores', topCorners: 'Cantos superiores', clearAll: 'Limpar tudo', chooseFinish: 'Escolha o acabamento', reconstruct: 'Reconstruir', soften: 'Suavizar', pixelate: 'Pixelizar', maskExpansion: 'Expansão da máscara', precise: 'Preciso', moreCoverage: 'Mais cobertura', cleanVideo: 'Limpar este vídeo', cleaningVideo: 'Limpando seu vídeo', cleanedReady: 'Vídeo limpo pronto', downloadMp4: 'Baixar MP4', languageTitle: 'Idioma', search: 'Pesquisar', footerTagline: 'Ferramentas online para vídeo, imagens e conversão de arquivos' },
  FR: { ...ENGLISH_TRANSLATIONS, navVideo: 'Outils vidéo', signIn: 'Connexion', homeTagline: 'Outils en ligne simples pour la vidéo, les images et la conversion de fichiers', videoTools: 'Outils vidéo', removeLogo: 'Supprimer le logo de la vidéo', toolTitle: 'Supprimer le logo de la vidéo', toolSubtitle: 'Supprimez facilement les logos et filigranes de vos vidéos', chooseFile: 'Choisir un fichier', dropFile: 'ou déposez un fichier ici', stepUpload: 'Importer la vidéo', stepMark: 'Marquer le filigrane', stepDownload: 'Télécharger le résultat', selectArea: 'Sélectionnez la zone du filigrane', readyToMark: 'Prêt à marquer', markWatermark: 'Marquer le filigrane', lowerCorners: 'Coins inférieurs', topCorners: 'Coins supérieurs', clearAll: 'Tout effacer', chooseFinish: 'Choisir le rendu', reconstruct: 'Reconstruire', soften: 'Adoucir', pixelate: 'Pixelliser', maskExpansion: 'Extension du masque', precise: 'Précis', moreCoverage: 'Plus de couverture', cleanVideo: 'Nettoyer cette vidéo', cleaningVideo: 'Nettoyage de votre vidéo', cleanedReady: 'Vidéo nettoyée prête', downloadMp4: 'Télécharger MP4', languageTitle: 'Langue', search: 'Rechercher', footerTagline: 'Outils en ligne pour vidéo, images et conversion de fichiers' },
  DE: { ...ENGLISH_TRANSLATIONS, navVideo: 'Video-Tools', signIn: 'Anmelden', homeTagline: 'Einfache Online-Tools für Video, Bilder und Dateikonvertierung', videoTools: 'Video-Tools', removeLogo: 'Logo aus Video entfernen', toolTitle: 'Logo aus Video entfernen', toolSubtitle: 'Logos und Wasserzeichen einfach aus Videos entfernen', chooseFile: 'Datei auswählen', dropFile: 'oder Datei hier ablegen', stepUpload: 'Video hochladen', stepMark: 'Wasserzeichen markieren', stepDownload: 'Ergebnis herunterladen', selectArea: 'Wasserzeichenbereich auswählen', readyToMark: 'Bereit zum Markieren', markWatermark: 'Wasserzeichen markieren', lowerCorners: 'Untere Ecken', topCorners: 'Obere Ecken', clearAll: 'Alles löschen', chooseFinish: 'Methode wählen', reconstruct: 'Rekonstruieren', soften: 'Weichzeichnen', pixelate: 'Pixeln', maskExpansion: 'Maskenerweiterung', precise: 'Präzise', moreCoverage: 'Mehr Abdeckung', cleanVideo: 'Video bereinigen', cleaningVideo: 'Video wird bereinigt', cleanedReady: 'Bereinigtes Video bereit', downloadMp4: 'MP4 herunterladen', languageTitle: 'Sprache', search: 'Suchen', footerTagline: 'Online-Tools für Video, Bilder und Dateikonvertierung' },
  IT: { ...ENGLISH_TRANSLATIONS, navVideo: 'Strumenti video', signIn: 'Accedi', homeTagline: 'Strumenti online semplici per video, immagini e conversione di file', videoTools: 'Strumenti video', removeLogo: 'Rimuovi logo dal video', toolTitle: 'Rimuovi logo dal video', toolSubtitle: 'Rimuovi facilmente loghi e filigrane dai tuoi video', chooseFile: 'Scegli file', dropFile: 'o trascina qui un file', stepUpload: 'Carica video', stepMark: 'Segna filigrana', stepDownload: 'Scarica risultato', selectArea: 'Seleziona l’area della filigrana', readyToMark: 'Pronto per segnare', markWatermark: 'Segna la filigrana', lowerCorners: 'Angoli inferiori', topCorners: 'Angoli superiori', clearAll: 'Cancella tutto', chooseFinish: 'Scegli il metodo', reconstruct: 'Ricostruisci', soften: 'Sfuma', pixelate: 'Pixelizza', maskExpansion: 'Espansione maschera', precise: 'Preciso', moreCoverage: 'Più copertura', cleanVideo: 'Pulisci questo video', cleaningVideo: 'Pulizia del video', cleanedReady: 'Video pulito pronto', downloadMp4: 'Scarica MP4', languageTitle: 'Lingua', search: 'Cerca', footerTagline: 'Strumenti online per video, immagini e conversione di file' },
  RU: { ...ENGLISH_TRANSLATIONS, navVideo: 'Видеоинструменты', signIn: 'Войти', homeTagline: 'Простые онлайн-инструменты для видео, изображений и конвертации файлов', videoTools: 'Видеоинструменты', removeLogo: 'Удалить логотип из видео', toolTitle: 'Удалить логотип из видео', toolSubtitle: 'Легко удаляйте логотипы и водяные знаки из видео', chooseFile: 'Выбрать файл', dropFile: 'или перетащите файл сюда', stepUpload: 'Загрузить видео', stepMark: 'Отметить водяной знак', stepDownload: 'Скачать результат', selectArea: 'Выберите область водяного знака', readyToMark: 'Готово к разметке', markWatermark: 'Отметьте водяной знак', lowerCorners: 'Нижние углы', topCorners: 'Верхние углы', clearAll: 'Очистить всё', chooseFinish: 'Выберите обработку', reconstruct: 'Восстановить', soften: 'Смягчить', pixelate: 'Пикселизировать', maskExpansion: 'Расширение маски', precise: 'Точно', moreCoverage: 'Больше покрытия', cleanVideo: 'Очистить видео', cleaningVideo: 'Очистка видео', cleanedReady: 'Очищенное видео готово', downloadMp4: 'Скачать MP4', languageTitle: 'Язык', search: 'Поиск', footerTagline: 'Онлайн-инструменты для видео, изображений и конвертации файлов' },
  'ZH-CN': { ...ENGLISH_TRANSLATIONS, navVideo: '视频工具', signIn: '登录', homeTagline: '简单的在线视频、图片和文件转换工具', videoTools: '视频工具', removeLogo: '移除视频标志', toolTitle: '移除视频标志', toolSubtitle: '轻松移除视频中的标志和水印', chooseFile: '选择文件', dropFile: '或将文件拖到这里', stepUpload: '上传视频', stepMark: '标记水印', stepDownload: '下载结果', selectArea: '选择水印区域', readyToMark: '准备标记', markWatermark: '标记水印', lowerCorners: '下方角落', topCorners: '上方角落', clearAll: '全部清除', chooseFinish: '选择处理方式', reconstruct: '重建', soften: '柔化', pixelate: '像素化', maskExpansion: '遮罩扩展', precise: '精确', moreCoverage: '更多覆盖', cleanVideo: '清理视频', cleaningVideo: '正在清理视频', cleanedReady: '清理后的视频已准备好', downloadMp4: '下载 MP4', languageTitle: '语言', search: '搜索', footerTagline: '视频、图片和文件转换在线工具' },
  'ZH-TW': { ...ENGLISH_TRANSLATIONS, navVideo: '影片工具', signIn: '登入', homeTagline: '簡單的線上影片、圖片和檔案轉換工具', videoTools: '影片工具', removeLogo: '移除影片標誌', toolTitle: '移除影片標誌', toolSubtitle: '輕鬆移除影片中的標誌和浮水印', chooseFile: '選擇檔案', dropFile: '或將檔案拖到這裡', stepUpload: '上傳影片', stepMark: '標記浮水印', stepDownload: '下載結果', selectArea: '選擇浮水印區域', readyToMark: '準備標記', markWatermark: '標記浮水印', lowerCorners: '下方角落', topCorners: '上方角落', clearAll: '全部清除', chooseFinish: '選擇處理方式', reconstruct: '重建', soften: '柔化', pixelate: '像素化', maskExpansion: '遮罩擴展', precise: '精確', moreCoverage: '更多覆蓋', cleanVideo: '清理影片', cleaningVideo: '正在清理影片', cleanedReady: '清理後的影片已準備好', downloadMp4: '下載 MP4', languageTitle: '語言', search: '搜尋', footerTagline: '影片、圖片和檔案轉換線上工具' },
  JA: { ...ENGLISH_TRANSLATIONS, navVideo: '動画ツール', signIn: 'サインイン', homeTagline: '動画、画像、ファイル変換のためのシンプルなオンラインツール', videoTools: '動画ツール', removeLogo: '動画からロゴを削除', toolTitle: '動画からロゴを削除', toolSubtitle: '動画からロゴや透かしを簡単に削除します', chooseFile: 'ファイルを選択', dropFile: 'またはここにドロップ', stepUpload: '動画をアップロード', stepMark: '透かしをマーク', stepDownload: '結果をダウンロード', selectArea: '透かしの範囲を選択', readyToMark: 'マークできます', markWatermark: '透かしをマーク', lowerCorners: '下隅', topCorners: '上隅', clearAll: 'すべてクリア', chooseFinish: '仕上がりを選択', reconstruct: '再構成', soften: 'ぼかす', pixelate: 'モザイク', maskExpansion: 'マスクの拡張', precise: '正確', moreCoverage: '広くする', cleanVideo: '動画をクリーニング', cleaningVideo: '動画を処理中', cleanedReady: '処理済み動画の準備完了', downloadMp4: 'MP4をダウンロード', languageTitle: '言語', search: '検索', footerTagline: '動画、画像、ファイル変換のオンラインツール' },
  KO: { ...ENGLISH_TRANSLATIONS, navVideo: '동영상 도구', signIn: '로그인', homeTagline: '동영상, 이미지, 파일 변환을 위한 간단한 온라인 도구', videoTools: '동영상 도구', removeLogo: '동영상 로고 제거', toolTitle: '동영상 로고 제거', toolSubtitle: '동영상에서 로고와 워터마크를 쉽게 제거하세요', chooseFile: '파일 선택', dropFile: '또는 여기에 파일을 놓으세요', stepUpload: '동영상 업로드', stepMark: '워터마크 표시', stepDownload: '결과 다운로드', selectArea: '워터마크 영역 선택', readyToMark: '표시할 준비 완료', markWatermark: '워터마크 표시', lowerCorners: '아래 모서리', topCorners: '위 모서리', clearAll: '모두 지우기', chooseFinish: '처리 방식 선택', reconstruct: '복원', soften: '부드럽게', pixelate: '픽셀화', maskExpansion: '마스크 확장', precise: '정밀', moreCoverage: '더 넓게', cleanVideo: '동영상 정리', cleaningVideo: '동영상 처리 중', cleanedReady: '정리된 동영상 준비 완료', downloadMp4: 'MP4 다운로드', languageTitle: '언어', search: '검색', footerTagline: '동영상, 이미지, 파일 변환 온라인 도구' },
  TR: { ...ENGLISH_TRANSLATIONS, navVideo: 'Video araçları', signIn: 'Giriş yap', homeTagline: 'Video, görsel ve dosya dönüştürme için basit çevrim içi araçlar', videoTools: 'Video araçları', removeLogo: 'Videodan logoyu kaldır', toolTitle: 'Videodan logoyu kaldır', toolSubtitle: 'Videolarınızdaki logo ve filigranları kolayca kaldırın', chooseFile: 'Dosya seç', dropFile: 'veya dosyayı buraya bırakın', stepUpload: 'Video yükle', stepMark: 'Filigranı işaretle', stepDownload: 'Sonucu indir', selectArea: 'Filigran alanını seçin', readyToMark: 'İşaretlemeye hazır', lowerCorners: 'Alt köşeler', topCorners: 'Üst köşeler', clearAll: 'Tümünü temizle', chooseFinish: 'Sonucu seçin', reconstruct: 'Yeniden oluştur', soften: 'Yumuşat', pixelate: 'Pikselleştir', maskExpansion: 'Maske genişletme', precise: 'Hassas', moreCoverage: 'Daha fazla kaplama', cleanVideo: 'Videoyu temizle', cleaningVideo: 'Video temizleniyor', cleanedReady: 'Temiz video hazır', downloadMp4: 'MP4 indir', languageTitle: 'Dil', search: 'Ara', footerTagline: 'Video, görsel ve dosya dönüştürme çevrim içi araçları' },
  ID: { ...ENGLISH_TRANSLATIONS, navVideo: 'Alat video', signIn: 'Masuk', homeTagline: 'Alat online sederhana untuk video, gambar, dan konversi file', videoTools: 'Alat video', removeLogo: 'Hapus logo dari video', toolTitle: 'Hapus logo dari video', toolSubtitle: 'Hapus logo dan watermark dari video dengan mudah', chooseFile: 'Pilih file', dropFile: 'atau jatuhkan file di sini', stepUpload: 'Unggah video', stepMark: 'Tandai watermark', stepDownload: 'Unduh hasil', selectArea: 'Pilih area watermark', readyToMark: 'Siap menandai', lowerCorners: 'Sudut bawah', topCorners: 'Sudut atas', clearAll: 'Hapus semua', chooseFinish: 'Pilih hasil', reconstruct: 'Rekonstruksi', soften: 'Lembutkan', pixelate: 'Pikselkan', maskExpansion: 'Perluasan mask', precise: 'Tepat', moreCoverage: 'Cakupan lebih luas', cleanVideo: 'Bersihkan video', cleaningVideo: 'Membersihkan video', cleanedReady: 'Video bersih siap', downloadMp4: 'Unduh MP4', languageTitle: 'Bahasa', search: 'Cari', footerTagline: 'Alat online untuk video, gambar, dan konversi file' },
  VI: { ...ENGLISH_TRANSLATIONS, navVideo: 'Công cụ video', signIn: 'Đăng nhập', homeTagline: 'Công cụ trực tuyến đơn giản cho video, hình ảnh và chuyển đổi tệp', videoTools: 'Công cụ video', removeLogo: 'Xóa logo khỏi video', toolTitle: 'Xóa logo khỏi video', toolSubtitle: 'Dễ dàng xóa logo và hình mờ khỏi video', chooseFile: 'Chọn tệp', dropFile: 'hoặc thả tệp vào đây', stepUpload: 'Tải video lên', stepMark: 'Đánh dấu hình mờ', stepDownload: 'Tải kết quả', selectArea: 'Chọn vùng hình mờ', readyToMark: 'Sẵn sàng đánh dấu', lowerCorners: 'Góc dưới', topCorners: 'Góc trên', clearAll: 'Xóa tất cả', chooseFinish: 'Chọn cách xử lý', reconstruct: 'Tái tạo', soften: 'Làm mềm', pixelate: 'Làm pixel', maskExpansion: 'Mở rộng mặt nạ', precise: 'Chính xác', moreCoverage: 'Bao phủ nhiều hơn', cleanVideo: 'Làm sạch video', cleaningVideo: 'Đang làm sạch video', cleanedReady: 'Video đã làm sạch sẵn sàng', downloadMp4: 'Tải MP4', languageTitle: 'Ngôn ngữ', search: 'Tìm kiếm', footerTagline: 'Công cụ trực tuyến cho video, hình ảnh và chuyển đổi tệp' },
  TH: { ...ENGLISH_TRANSLATIONS, navVideo: 'เครื่องมือวิดีโอ', signIn: 'เข้าสู่ระบบ', homeTagline: 'เครื่องมือออนไลน์ง่าย ๆ สำหรับวิดีโอ รูปภาพ และการแปลงไฟล์', videoTools: 'เครื่องมือวิดีโอ', removeLogo: 'ลบโลโก้ออกจากวิดีโอ', toolTitle: 'ลบโลโก้ออกจากวิดีโอ', toolSubtitle: 'ลบโลโก้และลายน้ำออกจากวิดีโอได้อย่างง่ายดาย', chooseFile: 'เลือกไฟล์', dropFile: 'หรือลากไฟล์มาที่นี่', stepUpload: 'อัปโหลดวิดีโอ', stepMark: 'ทำเครื่องหมายลายน้ำ', stepDownload: 'ดาวน์โหลดผลลัพธ์', selectArea: 'เลือกพื้นที่ลายน้ำ', readyToMark: 'พร้อมทำเครื่องหมาย', lowerCorners: 'มุมล่าง', topCorners: 'มุมบน', clearAll: 'ล้างทั้งหมด', chooseFinish: 'เลือกวิธีการ', reconstruct: 'สร้างใหม่', soften: 'ทำให้นุ่ม', pixelate: 'ทำพิกเซล', maskExpansion: 'ขยายหน้ากาก', precise: 'แม่นยำ', moreCoverage: 'ครอบคลุมมากขึ้น', cleanVideo: 'ทำความสะอาดวิดีโอ', cleaningVideo: 'กำลังทำความสะอาดวิดีโอ', cleanedReady: 'วิดีโอที่ทำความสะอาดพร้อมแล้ว', downloadMp4: 'ดาวน์โหลด MP4', languageTitle: 'ภาษา', search: 'ค้นหา', footerTagline: 'เครื่องมือออนไลน์สำหรับวิดีโอ รูปภาพ และการแปลงไฟล์' },
  PL: { ...ENGLISH_TRANSLATIONS, navVideo: 'Narzędzia wideo', signIn: 'Zaloguj się', homeTagline: 'Proste narzędzia online do wideo, obrazów i konwersji plików', videoTools: 'Narzędzia wideo', removeLogo: 'Usuń logo z filmu', toolTitle: 'Usuń logo z filmu', toolSubtitle: 'Łatwo usuwaj logo i znaki wodne z filmów', chooseFile: 'Wybierz plik', dropFile: 'lub upuść plik tutaj', stepUpload: 'Prześlij film', stepMark: 'Zaznacz znak wodny', stepDownload: 'Pobierz wynik', selectArea: 'Wybierz obszar znaku wodnego', readyToMark: 'Gotowe do zaznaczania', lowerCorners: 'Dolne rogi', topCorners: 'Górne rogi', clearAll: 'Wyczyść wszystko', chooseFinish: 'Wybierz sposób', reconstruct: 'Odtwórz', soften: 'Zmiękcz', pixelate: 'Pikselizuj', maskExpansion: 'Rozszerzenie maski', precise: 'Precyzyjnie', moreCoverage: 'Większy obszar', cleanVideo: 'Wyczyść film', cleaningVideo: 'Czyszczenie filmu', cleanedReady: 'Gotowy wyczyszczony film', downloadMp4: 'Pobierz MP4', languageTitle: 'Język', search: 'Szukaj', footerTagline: 'Narzędzia online do wideo, obrazów i konwersji plików' }
};

function t(key, fallback = key) {
  return (TRANSLATIONS[activeLanguageCode] || ENGLISH_TRANSLATIONS)[key] || fallback;
}

function translatePage(code = 'EN') {
  const locale = TRANSLATIONS[code] || ENGLISH_TRANSLATIONS;
  document.querySelectorAll('[data-i18n]').forEach((element) => {
    const value = locale[element.dataset.i18n] || ENGLISH_TRANSLATIONS[element.dataset.i18n];
    if (value) element.textContent = value;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    const value = locale[element.dataset.i18nPlaceholder] || ENGLISH_TRANSLATIONS[element.dataset.i18nPlaceholder];
    if (value) element.setAttribute('placeholder', value);
  });
}

function openLanguageSelector() { 
  languageModal.classList.remove('is-hidden');
  languageButton.setAttribute('aria-expanded', 'true');
  languageSearch.value = '';
  filterLanguages('');
  window.setTimeout(() => languageSearch.focus(), 0);
}

function closeLanguageSelector() {
  languageModal.classList.add('is-hidden');
  languageButton.setAttribute('aria-expanded', 'false');
  languageButton.focus();
}

function filterLanguages(query) {
  const normalized = query.trim().toLowerCase();
  let visible = 0;
  languageOptions.forEach((option) => {
    const matches = !normalized || option.dataset.name.toLowerCase().includes(normalized) || option.dataset.code.toLowerCase().includes(normalized);
    option.classList.toggle('is-hidden', !matches);
    if (matches) visible += 1;
  });
  languageEmpty.classList.toggle('is-hidden', visible !== 0);
}

function chooseLanguage(option) {
  languageOptions.forEach((item) => item.classList.toggle('active', item === option));
  activeLanguageCode = option.dataset.code;
  currentLanguage.textContent = option.dataset.code.split('-')[0];
  translatePage(option.dataset.code);
  try { localStorage.setItem('mediapilot-language', option.dataset.code); } catch (_) { /* storage can be disabled */ }
  closeLanguageSelector();
}

function restoreLanguage() {
  let stored = 'EN';
  try { stored = localStorage.getItem('mediapilot-language') || 'EN'; } catch (_) { /* storage can be disabled */ }
  const option = languageOptions.find((item) => item.dataset.code === stored) || languageOptions[0];
  chooseLanguage(option);
}

function showRoute() {
  // Trailing slashes are stripped so /tools/remove-watermark-video/ matches too.
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const toolPaths = ['/remove-logo', '/watermark-remover', '/tools/remove-watermark-video'];
  // The standalone tool pages ship only the tool view, so they are always on the tool route.
  const toolRoute = !homeView || toolPaths.includes(path) || window.location.hash === '#remove-logo';
  homeView?.classList.toggle('is-hidden', toolRoute);
  toolView?.classList.toggle('is-hidden', !toolRoute);
}

function setPreviewStatus(label, kind = '') {
  previewStatus.className = `preview-status ${kind}`.trim();
  previewStatus.innerHTML = `<span class="status-dot"></span><span>${label}</span>`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'duration unknown';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

function updateStrength() {
  const value = Number(strengthSlider.value);
  strengthValue.textContent = `${value} px`;
  const percentage = ((value - Number(strengthSlider.min)) / (Number(strengthSlider.max) - Number(strengthSlider.min))) * 100;
  strengthSlider.style.background = `linear-gradient(90deg, var(--accent) 0%, var(--accent) ${percentage}%, rgba(255,255,255,.11) ${percentage}%, rgba(255,255,255,.11) 100%)`;
}

function updateProcessButton() {
  processButton.disabled = state.processing || !state.asset || state.regions.length === 0;
}

function loadPreviewImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The first frame could not be displayed.'));
    image.src = dataUrl;
  });
}

// ---------------------------------------------------------------------------
// Video cleaning runs entirely in the browser through ffmpeg.wasm, so the site
// is static and needs no backend.
// ponytail: single-threaded core, which avoids the COOP/COEP headers the
// multi-threaded build requires. Switch to @ffmpeg/core-mt plus a Cloudflare
// `_headers` file if processing speed becomes the complaint.
const FFMPEG_DIST = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

let enginePromise = null;
let progressSink = null;
let lastEngineLog = '';

// Resolves to a loaded ffmpeg.wasm instance. The ~31 MB core downloads once and is
// served from the browser cache afterwards.
function getEngine(onMessage) {
  if (!enginePromise) {
    enginePromise = (async () => {
      onMessage?.('Loading the video engine (one-time download)…');
      const { FFmpeg } = await import(`${FFMPEG_DIST}/index.js`);
      const engine = new FFmpeg();
      engine.on('progress', (event) => progressSink?.(event.progress));
      engine.on('log', (event) => { lastEngineLog = event.message; });
      // A worker cannot be constructed from another origin, so it is started from a same-origin
      // blob that re-imports the real one. Copying worker.js into the blob instead would break
      // its relative imports, which would resolve against the blob URL.
      const workerShim = URL.createObjectURL(
        new Blob([`import "${FFMPEG_DIST}/worker.js";`], { type: 'text/javascript' })
      );
      try {
        await engine.load({
          classWorkerURL: workerShim,
          coreURL: `${FFMPEG_CORE}/ffmpeg-core.js`,
          wasmURL: `${FFMPEG_CORE}/ffmpeg-core.wasm`,
        });
      } finally {
        URL.revokeObjectURL(workerShim);
      }
      return engine;
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

function extensionOf(name) {
  const match = /\.[a-z0-9]+$/i.exec(name || '');
  return match ? match[0].toLowerCase() : '.mp4';
}

async function runEngine(engine, args) {
  lastEngineLog = '';
  const code = await engine.exec(args);
  if (code !== 0) throw new Error(lastEngineLog || 'The video engine could not process this file.');
}

// Reads dimensions and a preview frame with the built-in decoder. Rejects for containers
// the browser cannot play, which the ffmpeg fallback below then handles.
function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      action();
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(() => reject(new Error('This video cannot be decoded by the browser.')));
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const preview = canvas.toDataURL('image/jpeg', 0.85);
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      finish(() => resolve({ width: video.videoWidth, height: video.videoHeight, duration, preview }));
    };
    // Screen and camera recordings report an infinite duration and may never fire `seeked`,
    // so fall back to whichever frame has decoded by then.
    const timer = window.setTimeout(capture, 4000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadeddata = () => {
      // The very first frame is often black, so sample a little way in when that is possible.
      if (Number.isFinite(video.duration) && video.duration > 1) video.currentTime = Math.min(0.5, video.duration / 3);
      else capture();
    };
    video.onseeked = capture;
    video.onerror = () => finish(() => reject(new Error('This video cannot be decoded by the browser.')));
    video.src = url;
  });
}

// Fallback for AVI, MKV and WMV, which browsers generally refuse to decode.
async function readVideoMetadataWithEngine(file, onMessage) {
  const engine = await getEngine(onMessage);
  const input = `probe${extensionOf(file.name)}`;
  onMessage?.('Reading the first frame…');
  await engine.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  try {
    await runEngine(engine, ['-i', input, '-frames:v', '1', '-q:v', '3', 'probe.jpg']);
    const jpeg = await engine.readFile('probe.jpg');
    const preview = await blobToDataUrl(new Blob([jpeg], { type: 'image/jpeg' }));
    const image = await loadPreviewImage(preview);
    return { width: image.naturalWidth, height: image.naturalHeight, duration: 0, preview };
  } finally {
    await engine.deleteFile(input).catch(() => {});
    await engine.deleteFile('probe.jpg').catch(() => {});
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('The first frame could not be read.'));
    reader.readAsDataURL(blob);
  });
}

function clampInt(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

// Turns the normalised selection boxes into pixel rectangles that sit strictly inside
// the frame, which delogo and overlay both require.
function toPixelBoxes(regions, mode, strength, width, height) {
  const pad = mode === 'inpaint' ? Math.round(strength / 2) : 0;
  const boxes = [];
  for (const region of regions) {
    // Drop empty selections here; clamping below would otherwise inflate them to 2px.
    if (!(region.w * width >= 2) || !(region.h * height >= 2)) continue;
    const x = clampInt(region.x * width - pad, 1, width - 3);
    const y = clampInt(region.y * height - pad, 1, height - 3);
    const w = clampInt(region.w * width + pad * 2, 2, width - x - 1);
    const h = clampInt(region.h * height + pad * 2, 2, height - y - 1);
    boxes.push({ x, y, w, h });
  }
  if (!boxes.length) throw new Error('Those selection zones fall outside the video frame.');
  return boxes;
}

function buildFilterGraph(boxes, mode, strength) {
  if (mode === 'inpaint') {
    // delogo interpolates each box from the pixels around it, the closest match to the
    // OpenCV inpaint the old backend used.
    return `[0:v]${boxes.map((b) => `delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}`).join(',')}[v]`;
  }
  // blur and pixelate operate on a crop of each box that is composited back over the frame.
  const block = Math.max(4, Math.min(32, 52 - strength));
  const parts = [`[0:v]split=${boxes.length + 1}[bg]${boxes.map((_, i) => `[c${i}]`).join('')}`];
  boxes.forEach((b, i) => {
    const effect = mode === 'blur'
      ? `boxblur=${Math.max(2, Math.round(strength * 0.9))}:2`
      : `scale=${Math.max(1, Math.round(b.w / block))}:${Math.max(1, Math.round(b.h / block))},scale=${b.w}:${b.h}:flags=neighbor`;
    parts.push(`[c${i}]crop=${b.w}:${b.h}:${b.x}:${b.y},${effect}[e${i}]`);
  });
  boxes.forEach((b, i) => {
    const base = i === 0 ? '[bg]' : `[s${i - 1}]`;
    const out = i === boxes.length - 1 ? '[v]' : `[s${i}]`;
    parts.push(`${base}[e${i}]overlay=${b.x}:${b.y}${out}`);
  });
  return parts.join(';');
}

async function cleanVideo(file, { regions, mode, strength, width, height, onMessage, onProgress }) {
  const boxes = toPixelBoxes(regions, mode, strength, width, height);
  const graph = buildFilterGraph(boxes, mode, strength);
  const engine = await getEngine(onMessage);
  const input = `source${extensionOf(file.name)}`;
  onMessage?.('Reading your video…');
  await engine.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  progressSink = onProgress;
  try {
    onMessage?.('Cleaning frames…');
    await runEngine(engine, [
      '-i', input,
      '-fps_mode', 'passthrough',
      '-filter_complex', graph,
      '-map', '[v]',
      // The audio track is copied straight through when the source has one.
      '-map', '0:a?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      'cleaned.mp4',
    ]);
    const data = await engine.readFile('cleaned.mp4');
    return new Blob([data], { type: 'video/mp4' });
  } finally {
    progressSink = null;
    await engine.deleteFile(input).catch(() => {});
    await engine.deleteFile('cleaned.mp4').catch(() => {});
  }
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function normalizedPointer(event) {
  const bounds = frameCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
  };
}

function drawLabel(text, x, y, fill) {
  ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  const paddingX = 6;
  const width = ctx.measureText(text).width + paddingX * 2;
  const top = Math.max(0, y - 23);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, top, width, 19, 5);
  ctx.fill();
  ctx.fillStyle = '#142018';
  ctx.fillText(text, x + paddingX, top + 13);
}

function drawFrame() {
  if (!state.image) return;
  const width = state.image.naturalWidth;
  const height = state.image.naturalHeight;
  frameCanvas.width = width;
  frameCanvas.height = height;
  ctx.drawImage(state.image, 0, 0, width, height);

  state.regions.forEach((region, index) => {
    const x = region.x * width;
    const y = region.y * height;
    const w = region.w * width;
    const h = region.h * height;
    const selected = index === state.regions.length - 1 && !state.drawing;
    ctx.fillStyle = selected ? 'rgba(198,243,107,.18)' : 'rgba(117,217,191,.13)';
    ctx.strokeStyle = selected ? '#c6f36b' : '#75d9bf';
    ctx.lineWidth = Math.max(2, width / 600);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    drawLabel(`ZONE ${String(index + 1).padStart(2, '0')}`, x + 5, y + 23, selected ? '#c6f36b' : '#75d9bf');
  });

  if (state.drawing) {
    const { start, current } = state.drawing;
    const x = Math.min(start.x, current.x) * width;
    const y = Math.min(start.y, current.y) * height;
    const w = Math.abs(current.x - start.x) * width;
    const h = Math.abs(current.y - start.y) * height;
    ctx.fillStyle = 'rgba(232,164,107,.17)';
    ctx.strokeStyle = '#e8a46b';
    ctx.lineWidth = Math.max(2, width / 600);
    ctx.setLineDash([8, 5]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}

function renderZones() {
  zonesList.querySelectorAll('.zone-item').forEach((item) => item.remove());
  zonesEmpty.classList.toggle('is-hidden', state.regions.length > 0);
  state.regions.forEach((region, index) => {
    const item = document.createElement('div');
    item.className = 'zone-item';
    const left = Math.round(region.x * 100);
    const top = Math.round(region.y * 100);
    const width = Math.round(region.w * 100);
    const height = Math.round(region.h * 100);
    item.innerHTML = `
      <span class="zone-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="zone-coords">x ${left}% · y ${top}% · ${width}% × ${height}%</span>
      <button type="button" class="zone-remove" aria-label="Remove zone ${index + 1}" data-zone-index="${index}">×</button>
    `;
    zonesList.appendChild(item);
  });
  drawFrame();
  updateProcessButton();
}

function setAssetUi(asset, file) {
  state.asset = asset;
  assetName.textContent = asset.fileName;
  assetThumbLetter.textContent = (asset.fileName || 'V').slice(0, 1).toUpperCase();
  assetMeta.textContent = `${asset.width} × ${asset.height} · ${formatDuration(asset.duration)}${file ? ` · ${formatSize(file.size)}` : ''}`;
  dropzone.classList.add('is-hidden');
  assetCard.classList.remove('is-hidden');
  editingModule.classList.remove('is-hidden');
  emptyPreview.classList.add('is-hidden');
  frameCanvas.classList.remove('is-hidden');
  frameReadout.textContent = `${asset.width} × ${asset.height} · frame 01`;
  setPreviewStatus(t('readyToMark', 'Ready to mark'), 'ready');
}

async function uploadVideo(file) {
  if (!file) return;
  const accepted = /\.(mp4|mov|m4v|webm|avi|mkv|wmv)$/i.test(file.name);
  if (!accepted) {
    showToast('Please choose an MP4, MOV, WebM, AVI, MKV, or WMV video.', true);
    return;
  }
  if (file.size > 800 * 1024 * 1024) {
    showToast('That file is over the 800 MB workspace limit.', true);
    return;
  }

  setPreviewStatus('Reading first frame…', 'working');
  dropzone.classList.add('is-hidden');
  assetCard.classList.remove('is-hidden');
  assetName.textContent = 'Reading video…';
  assetMeta.textContent = 'Inspecting source frame';
  processButton.disabled = true;
  try {
    let meta;
    try {
      meta = await readVideoMetadata(file);
    } catch {
      meta = await readVideoMetadataWithEngine(file, (text) => setPreviewStatus(text, 'working'));
    }
    state.sourceFile = file;
    state.image = await loadPreviewImage(meta.preview);
    state.regions = [];
    state.drawing = null;
    setAssetUi({ fileName: file.name, ...meta }, file);
    renderZones();
    drawFrame();
    resultCard.classList.add('is-hidden');
    processingCard.classList.add('is-hidden');
    showToast('Video loaded. Draw boxes around each watermark.');
  } catch (error) {
    state.asset = null;
    state.sourceFile = null;
    state.image = null;
    assetCard.classList.add('is-hidden');
    dropzone.classList.remove('is-hidden');
    editingModule.classList.add('is-hidden');
    emptyPreview.classList.remove('is-hidden');
    frameCanvas.classList.add('is-hidden');
    setPreviewStatus('Waiting for a video');
    showToast(error.message || 'Could not load that video.', true);
  }
  updateProcessButton();
}

function addPresetZones() {
  if (!state.asset) {
    showToast('Load a video first, then add corner zones.', true);
    return;
  }
  const presets = [
    { x: 0.01, y: 0.78, w: 0.27, h: 0.21 },
    { x: 0.80, y: 0.78, w: 0.19, h: 0.21 },
  ];
  if (state.regions.length === 0) state.regions = presets;
  else state.regions.push(...presets);
  renderZones();
  showToast('Two lower-corner zones added. Resize your boxes if the marks sit elsewhere.');
}

function addTopPresetZones() {
  if (!state.asset) {
    showToast('Load a video first, then add top-corner zones.', true);
    return;
  }
  const presets = [
    { x: 0.01, y: 0.01, w: 0.23, h: 0.17 },
    { x: 0.76, y: 0.01, w: 0.23, h: 0.17 },
  ];
  state.regions.push(...presets);
  renderZones();
  showToast('Top-corner zones added. Re-run the cleanup to cover those marks too.');
}

function clearZones() {
  state.regions = [];
  state.drawing = null;
  renderZones();
}

function startDrawing(event) {
  if (!state.asset || state.processing) return;
  event.preventDefault();
  frameCanvas.setPointerCapture?.(event.pointerId);
  const point = normalizedPointer(event);
  state.drawing = { start: point, current: point };
  drawFrame();
}

function moveDrawing(event) {
  if (!state.drawing) return;
  event.preventDefault();
  state.drawing.current = normalizedPointer(event);
  drawFrame();
}

function finishDrawing(event) {
  if (!state.drawing) return;
  event.preventDefault();
  const point = normalizedPointer(event);
  const start = state.drawing.start;
  state.drawing = null;
  const x = Math.min(start.x, point.x);
  const y = Math.min(start.y, point.y);
  const w = Math.abs(point.x - start.x);
  const h = Math.abs(point.y - start.y);
  if (w < 0.012 || h < 0.012) {
    drawFrame();
    return;
  }
  state.regions.push({ x, y, w, h });
  renderZones();
}

function updateModeStyles() {
  $$('.mode-option').forEach((option) => {
    option.classList.toggle('active', option.querySelector('input').checked);
  });
}

async function beginProcessing() {
  if (!state.asset || state.regions.length === 0 || state.processing) {
    if (!state.asset) showToast('Load a video first.', true);
    else if (state.regions.length === 0) showToast('Draw at least one box over a watermark.', true);
    return;
  }
  state.processing = true;
  updateProcessButton();
  processButton.querySelector('span').textContent = t('cleaningVideo', 'Cleaning…');
  processingCard.classList.remove('is-hidden');
  resultCard.classList.add('is-hidden');
  processingTitle.textContent = t('cleaningVideo', 'Cleaning your video');
  processingMessage.textContent = t('preparingFrames', 'Preparing frames…');
  progressBar.style.width = '0%';
  progressValue.textContent = '0%';
  setPreviewStatus('Processing frames', 'working');

  const selectedMode = document.querySelector('input[name="mode"]:checked')?.value || 'inpaint';
  try {
    const blob = await cleanVideo(state.sourceFile, {
      regions: state.regions,
      mode: selectedMode,
      strength: Number(strengthSlider.value),
      width: state.asset.width,
      height: state.asset.height,
      onMessage: (text) => { processingMessage.textContent = text; },
      onProgress: (ratio) => {
        const percent = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
        progressBar.style.width = `${percent}%`;
        progressValue.textContent = `${percent}%`;
      },
    });
    showResult(blob);
  } catch (error) {
    finishWithError(error.message || 'Could not clean this video.');
  }
}

function showResult(blob) {
  state.processing = false;
  processButton.querySelector('span').textContent = t('cleanVideo', 'Clean again');
  updateProcessButton();
  processingCard.classList.add('is-hidden');
  resultCard.classList.remove('is-hidden');
  progressBar.style.width = '100%';
  progressValue.textContent = '100%';
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  resultVideo.src = state.resultUrl;
  resultVideo.load();
  const name = `cleaned-${(state.asset?.fileName || 'video').replace(/\.[^.]+$/, '')}.mp4`;
  downloadButton.href = state.resultUrl;
  downloadButton.dataset.downloadUrl = state.resultUrl;
  downloadButton.dataset.fileName = name;
  downloadButton.setAttribute('download', name);
  resultMeta.textContent = `MP4 · ${formatSize(blob.size)} · audio kept when the source had it`;
  setPreviewStatus(t('cleanedReady', 'Clean video ready'), 'ready');
  showToast('Done — your cleaned video is ready to review.');
}

function finishWithError(message) {
  state.processing = false;
  processingCard.classList.add('is-hidden');
  processButton.querySelector('span').textContent = 'Clean this video';
  updateProcessButton();
  setPreviewStatus('Processing failed');
  showToast(message, true);
}

function requestDownload(event) {
  const url = downloadButton.dataset.downloadUrl || downloadButton.getAttribute('href');
  if (!url || url === '#') {
    event.preventDefault();
    showToast('Process a video before downloading.', true);
    return;
  }
  // Keep this as a native, user-initiated link. The previous Blob approach could be
  // blocked by the embedded preview sandbox after its async fetch completed.
  downloadButton.href = url;
  downloadButton.setAttribute('download', downloadButton.dataset.fileName || 'cleaned-video.mp4');
  showToast('Download requested — check your browser downloads.');
}


// Upload interactions.
videoInput.addEventListener('change', (event) => uploadVideo(event.target.files?.[0]));
replaceButton.addEventListener('click', () => {
  dropzone.classList.remove('is-hidden');
  videoInput.click();
});
dropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    videoInput.click();
  }
});
['dragenter', 'dragover'].forEach((name) => dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  dropzone.classList.add('drag-over');
}));
['dragleave', 'drop'].forEach((name) => dropzone.addEventListener(name, (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
}));
dropzone.addEventListener('drop', (event) => uploadVideo(event.dataTransfer.files?.[0]));

// Canvas marking interactions.
frameCanvas.addEventListener('pointerdown', startDrawing);
frameCanvas.addEventListener('pointermove', moveDrawing);
frameCanvas.addEventListener('pointerup', finishDrawing);
frameCanvas.addEventListener('pointercancel', finishDrawing);

presetButton.addEventListener('click', addPresetZones);
topPresetButton.addEventListener('click', addTopPresetZones);
clearButton.addEventListener('click', clearZones);
zonesList.addEventListener('click', (event) => {
  const button = event.target.closest('.zone-remove');
  if (!button) return;
  const index = Number(button.dataset.zoneIndex);
  state.regions.splice(index, 1);
  renderZones();
});
strengthSlider.addEventListener('input', updateStrength);
$$('input[name="mode"]').forEach((input) => input.addEventListener('change', updateModeStyles));
processButton.addEventListener('click', beginProcessing);
downloadButton.addEventListener('click', requestDownload);
languageButton.addEventListener('click', openLanguageSelector);
languageClose.addEventListener('click', closeLanguageSelector);
languageModal.querySelector('[data-language-close]').addEventListener('click', closeLanguageSelector);
languageSearch.addEventListener('input', (event) => filterLanguages(event.target.value));
languageOptions.forEach((option) => option.addEventListener('click', () => chooseLanguage(option)));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !languageModal.classList.contains('is-hidden')) closeLanguageSelector();
});

showRoute();
restoreLanguage();
window.addEventListener('popstate', showRoute);
updateStrength();
updateModeStyles();
renderZones();
