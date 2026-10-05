# AI-ON 설계 및 원본 검토

## 원본 확인
보고서 22쪽 전체 텍스트를 검토하고 검사 문항이 있는 12쪽을 렌더링해 대조했다. A~E 28문항, E5 역채점, 성찰 7항목, 발화 7범주를 보존한다. E5의 '(역채점)'은 문항 문장이 아니라 연구자용 메타데이터로 분리한다. 원본 문항 자료는 src/data/instruments.js에 버전으로 고정한다.

기존 두 HTML은 window.claude.use('db'/'user'/'downloads')에 의존한다. 독립 브라우저에서 연구자료를 원격 보존할 수 없다. 기록장은 이름/과제 문자열과 Claude UID로 자료를 묶으며 차시 1~9가 고정되어 있다. 사용자별 구독을 56개로 제한해 전체 자료가 누락될 수 있다. 로컬 비밀번호는 서버 권한 검사가 아니다. CSV 익명번호를 이름 정렬 순서로 다시 생성하므로 종단 연결이 불안정하다. 프롬프트 원문을 60,000자, 발화를 6,000자로 조용히 자른다. 교사 코딩 저장은 자동코드를 교사코드로 복사하므로 수정 여부가 소실된다. 재사용: 검사 원문, 코드북, 휴리스틱 초안, 정서 칩, 성찰 구조, 루브릭 설명, 내용타당도 지수 계산. 자동분류는 연구자의 판단을 대신하지 않는다.

내용타당도 도구의 CVR은 적합성 3·4점 비율을 사용한다. 전통적 필수성 판단 CVR과 구분해야 하므로 기존 계산을 보존하되 '기존 방식 CVR(적합성 기반)'으로 표시한다. 연구방법 변경이나 문항 수정은 수행하지 않는다. 자유서술에 학생 스스로 실명을 쓰면 ID 익명화만으로 텍스트까지 익명화되지는 않는다. 내보내기 화면에서 원문 점검을 안내한다.

## 구성
React + Vite + HashRouter / Firebase Auth / Firestore / GitHub Pages. 원자료는 Firestore, 브라우저는 UID·프로젝트·학생·기록키로 분리한 임시 초안만 보관한다. 연결되지 않은 상태는 명확히 표시하고 실자료 접수를 차단한다. 개발 미리보기는 메모리 저장만 사용하며 재시작 시 폐기한다.

## 학생 인증
Firebase 익명 Auth로 기기 세션을 만들고 80비트 랜덤 개인코드(4글자×4묶음)를 SHA-256 해시한다. access/{hash}는 인증된 사용자의 단건 get만 가능하며 목록 읽기는 금지한다. get 결과는 프로젝트/학생 ID/토큰 버전만 포함하며 실명과 연구자료는 없다. bindings/{auth.uid} 생성·변경 시 Rules가 해시 문서와 프로젝트·학생·버전의 일치를 검사한다. 모든 학생 읽기/쓰기는 binding과 현재 participant.active/tokenVersion 및 프로젝트 상태를 검사한다. 재발급은 이전 해시 폐기 및 버전 증가로 기존 모든 기기 접근을 무효화한다. 코드는 URL fragment로만 QR에 넣고 로그인 후 제거한다. 공유기기의 '다른 학생'은 임시 초안과 Firebase 세션을 제거한다.

## 관리자 인증
Google 제공자 + email_verified + admins/{email}.active를 Rules에서 검사한다. ADMIN은 연구자료 관리, SUPER_ADMIN만 회원 변경. 최초 계정 kkankong21@gmail.com의 등록은 신뢰된 프로젝트 관리 권한으로 별도 초기화하며 프런트엔드 자동 승격을 허용하지 않는다.

## Firestore 모델
- admins/{email}: role, active
- access/{sha256}: project_id, participant_id, tokenVersion (비밀경로 단건 접근)
- bindings/{uid}: 위 값 + codeHash (자신만 get)
- projects/{projectId}: 제목, 교사, 집단, 주제, 시작일, sessionCount, enabled, postOpen, delayedOpen, archived
- projects/{projectId}/participants/{S001}: displayName, active, tokenVersion, createdAt
- projects/{projectId}/private_roster/{S001}: optional name, code, codeHash (관리자 전용)
- projects/{projectId}/records/{participant_kind_phase_session}: 종류, 연결키, 원자료, 상태, revision, 서버시각
- projects/{projectId}/records/{recordId}/revisions/{version}: 변경 전 전체 값, 변경자, 사유, 서버시각 (추가 전용)
- projects/{projectId}/teacher_codings/{recordId}: 교사 코드/평정/메모, 버전, 서버시각. 원자료와 별도.
- projects/{projectId}/validity_reviews/{reviewId}: 전문가 정보, 문항별 적합성·명확성·의견, 영역 대표성

survey_responses / journals / prompt_sessions는 records의 kind로 구분한다. prompt_turns는 prompt 원본과 함께 원자적으로 저장되는 배열이다. 대화 크기는 저장 전에 제한을 안내하며 절대 조용히 잘라 저장하지 않는다. raw/turns/auto/rubricDraft는 구분한다. 교사 코드 null은 미확정. 수정은 transaction으로 이전 revision 스냅샷을 보존한다. 학생 제출 후 변경 금지, 관리자 재개방은 원문을 보존하고 상태만 바꾼다.

## 화면
학생: 코드 입력 → 본인 확인 → 진행표 → 5영역 검사 / 3단계 성찰 / 대화 원문·화자 미리보기 → 제출 확인.
관리자: 프로젝트 목록 → 학생 진행표 / 타임라인 / 정성코딩 / 차시 분석 / 접속카드 / 내보내기 / 설정 / 연구도구.

## 배포 조건
Rules Emulator 격리·권한·제출잠금 테스트, 단위 테스트, production build, 360/768/1366 렌더링 검증 후 배포한다. 실 Firebase 계정 승인, 프로젝트 생성/선택, Google/익명 Auth 설정, 최초 관리자 초기화, GitHub 로그인, Pages 배포 및 실 URL 검증은 별도 완료 증거가 필요하다. 통과 전 PRODUCTION READY로 표시하지 않는다. Blaze/결제/Cloud Functions는 사용하지 않는다.
