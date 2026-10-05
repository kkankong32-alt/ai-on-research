# AI-ON 과학탐구 기록장

초등 과학탐구의 사전·사후·지연 검사, 성찰저널, AI 대화 기록을 프로젝트와 익명 학생 ID로 연결하는 연구용 웹앱입니다.

## 실행

Node 22+, Java 21+ 필요(보안 규칙 테스트).

```sh
npm ci
cp .env.example .env.local
npm run dev
npm test
npm run test:rules
npm run build
```

Firebase 공개 웹앱 설정은 `.env.local` 또는 GitHub Repository Variables로 공급합니다. 서비스 계정 키는 필요하지 않습니다. 최초 관리자 등록은 승인된 프로젝트 소유자의 권한으로 수행하고 일반 앱에서 자동 승격하지 않습니다.

## 데이터와 권한

- Google 로그인 + 등록 연구회원 목록을 서버 규칙에서 확인합니다.
- 학생은 익명 Auth + 랜덤 개인코드로 자기 프로젝트·학생 범위만 접근합니다.
- 제출 후 수정 잠금, 교사 재개방, revision 스냅샷을 적용합니다.
- 익명 CSV는 실명 매핑·개인코드를 제외합니다. 자유서술에 포함된 이름은 자동 제거하지 않습니다.
- Firestore가 원본 저장소입니다. localStorage는 미전송 초안 용도입니다.
- 개발 미리보기는 `npm run dev`에서만 제공되고 운영 빌드에서는 제거됩니다.

## 파일

`src/components`: 학생/연구자 UI, `src/services`: 인증·원격 저장, `src/data`: 검사·코드북 원본, `src/utils`: 점수·CSV·파서, `firestore.rules`: 접근 및 무결성 검증, `tests`: 단위·Rules 테스트, `docs/architecture.md`: 원본 분석 및 설계.

## 운영

Firebase 프로젝트: `ai-on-research-2026-kk21`. Firestore: 서울 `asia-northeast3`, Spark 무료 할당량. Cloud Functions/결제/Analytics 없음. Google 및 익명 인증을 사용합니다. 프런트엔드 배포: GitHub Pages Actions. HashRouter를 사용하므로 하위 경로 새로고침도 동작합니다.

```sh
firebase deploy --only firestore --project ai-on-research-2026-kk21
```

규칙 변경은 Emulator 테스트 후 별도 배포합니다. GitHub Actions에는 Firebase 관리 키나 토큰을 저장하지 않습니다. 사용량 한도에 도달하면 저장 오류가 표시되며 유료 요금제로 자동 전환하지 않습니다.

## 연구도구 주의사항

검사 문장은 제공 보고서 12쪽 및 HTML에서 보존했습니다. E5만 6−원응답으로 별도 역채점합니다. 정성 자동코딩과 루브릭은 휴리스틱 초안이며 교사의 확정 판단과 분리합니다. 내용타당도 기존 CVR은 적합성 3·4점 비율로 계산된 지수이며 전통적 필수성 CVR과 구분합니다. 통계적 유의성·효과성을 자동 결론내리지 않습니다.
