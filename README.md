# 나의 답안 연습실

서버와 DB 없이 브라우저에서 동작하는 정적 웹 앱입니다. 실행 소스는 `public/`에만 있습니다.

- 답안 작성기: `public/index.html`
- PDF → 답안 JSON 변환기: `public/pdf-to-json/`
- 작성기 글꼴: `public/assets/fonts/`

## 기능

문항별 기본 4쪽 및 자동 페이지 확장, 정렬·기호·확대·전체화면·타이머, PDF 인쇄, 브라우저 자동저장, JSON 내보내기·불러오기, 작성 내용 초기화를 지원합니다.

답안은 사이트 주소별 브라우저 localStorage에 저장됩니다. 기기 간 이동은 JSON 내보내기·불러오기를 사용하세요. 초기화는 모든 문항의 내용과 브라우저 저장 내용을 비우며 과목·문항 수·시간 설정은 유지합니다.

PDF 변환기는 텍스트 레이어가 있는 PDF(최대 30MB/200쪽)를 브라우저에서 처리합니다. PDF와 추출문은 서버에 업로드하지 않습니다. PDF.js 및 필요한 CMap·글꼴·WASM과 라이선스는 `public/pdf-to-json/vendor/`에 있습니다.

## 실행과 배포

설치·빌드·환경변수·DB가 필요하지 않습니다. Vercel은 `vercel.json`의 설정에 따라 `public/`만 정적 배포합니다.

로컬 실행: `python3 -m http.server 8000 --directory public`

변환기 검증: `node --test tests/converter.test.mjs`
