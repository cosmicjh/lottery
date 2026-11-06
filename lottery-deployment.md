# 로또 6/45 개선판 GitHub 적용·배포 안내

**기준:** 첨부 `lottery-main.zip` (2026-11-02 스냅샷)에서 작성한 패치. 기존 저장소 `https://github.com/cosmicjh/lottery`의 현재 `main`이 이 스냅샷보다 앞서갔을 수 있다.

## 1. 기본 원칙

- 기존 `data/lotto.json`, `data/weekly.json`, `data/study.json`은 **절대 과거 스냅샷으로 덮어쓰지 않는다**.
- 기존 `weekly-five-v1`, `weekly-five-v2-disjoint`, `cold100-prospective-v1` 구현과 이전 기록은 유지한다.
- 새 개인 추천 모드의 시드는 서버로 전송하거나 브라우저 저장소에 보관하지 않는다. 개인별 추천 결과도 공개 사전 기록에 자동 기록하지 않는다.
- 원격에 대한 직접 push 및 실제 배포는 이 분석 환경에서 수행하지 않았다.

## 2. 권장: Git 작업 방식

원격 프로젝트를 새로 내려받은 뒤 `lottery-changes.patch`를 **프로젝트 최상위**에 복사한다.

```bash
git clone https://github.com/cosmicjh/lottery.git
cd lottery
git switch -c feature/probability-audit

git status --short
git apply --check ../lottery-changes.patch
git apply ../lottery-changes.patch

node --test tests/*.test.mjs
python tools/verify.py
node tools/benchmark.mjs 1249

git diff -- data/
git status --short
```

`git diff -- data/` 결과가 없어야 한다. 새 문서·코드 및 `research/benchmark-1249.json`이 생기며, 기존 JSON은 변경되지 않아야 한다. 코드 변경이 현재 저장소와 충돌한다면 **임의로 `git apply --reject` 후 무검증 병합하지 말고** 최신 코드와의 차이를 먼저 검토한다.

모든 테스트가 통과하면:

```bash
git add README.md index.html scripts/portfolio.js tests/portfolio.test.mjs tests/weekly.test.mjs tools/ research/ lottery-analysis.md lottery-deployment.md .github/workflows/lotto-pages.yml
git commit -m "Add exact portfolio probability audit and optional personal picks"
git push -u origin feature/probability-audit
```

GitHub Pull Request로 변경 파일과 `data/` 무변경을 확인한 뒤 `main`에 병합한다. 저장소 권한·환경에 따라 브랜치 보호 규칙과 리뷰가 필요하다.

## 3. ZIP 파일로 수동 업로드하는 경우

`lottery-improved.zip`을 **먼저 압축 해제**한다. 이 ZIP에는 `data/`의 2026-11-02 스냅샷도 보존 차원에서 포함한다. GitHub의 최신 데이터가 존재한다면 `data/`는 업로드하지 않는다. 변경된 파일과 신규 파일만 현재 프로젝트의 같은 상대 경로에 추가한다.

`.github/workflows/lotto-pages.yml`은 숨김 경로이므로 업로드에서 빠뜨리지 않는다. 새로 추가한 `scripts/portfolio.js`도 반드시 프로젝트에 포함해야 한다. `index.html`만 교체하면 구매 화면의 신규 버튼과 계산 기능이 동작하지 않는다.

## 4. 자동화 및 GitHub Pages 확인

1. GitHub → **Settings → Pages**에서 Source가 **GitHub Actions**인지 확인한다.
2. GitHub → **Actions → Lotto Pages**에서 `workflow_dispatch`를 이용해 수동으로 실행하거나 `main` 병합 시 발생하는 빌드를 확인한다.
3. 작업 단계의 순서는 기존과 같이 Node 22 테스트 → 공식 자료 수집 → 다음 회차 기록 → JSON 변경 사항 저장 → 정적 파일 준비 → Pages 배포이다.
4. 새 배포 단계에서는 `public/scripts/portfolio.js`가 생성되는지 확인한다. 기존 `public/data/` JSON 세 파일도 변함없이 포함되어야 한다.
5. 배포된 페이지에서 **공통 v2 추천번호 5게임**, 개인 시드 생성, 상세 확률, 분할 시나리오, 연구 검증 표가 나타나는지 확인한다.
6. 기존 회차 기록의 `createdAt`, `games`, `version`과 연구의 `trainingHash`, `probabilities`가 소급 변경되지 않았는지 확인한다.
7. 중복된 외부 크론 서비스가 있다면 기존 예약 설정과 충돌하지 않는지 확인한다.

워크플로는 기존과 같이 수집 또는 기록 작업 실패 시 가능한 자료를 보존한 상태로 Pages를 배포하고, 마지막에 실패를 보고하도록 구성되어 있다. 외부 API 변경·권한 부족·Actions 장애가 발생할 수 있으므로 로그를 확인해야 한다.

## 5. 검증 명령과 기대 결과

```bash
node --version
node --test tests/*.test.mjs
python tools/verify.py
node tools/benchmark.mjs 1249
```

- Node.js: 프로젝트 워크플로는 **22**를 사용한다.
- 자동 테스트: 작성 환경에서 **33개 모두 통과**하였다.
- Python 결과: `at_least_one_ticket_matches_at_least`의 3, 4, 5, 6 키에 대해 `966650`, `56750`, `1175`, `5`가 표시되어야 한다.
- `tools/benchmark.mjs`는 **g++**가 추가로 필요하다. 이 도구는 1249회 v1·v2·비중복 후보에 대해 전체 8,145,060개 추첨 조합을 평가하며 `research/benchmark-1249.json`을 다시 만든다. GitHub Pages 운영에는 컴파일러가 필요 없다.

## 6. 웹페이지 사용자 점검

- 기존 **공통 추천 · v2**에서 1249회 추천번호를 생성하고 5게임/30개 번호/중복 0개를 확인한다.
- `5게임 정확한 당첨확률` 상세 영역에서 5등 이상 **11.86792976%**, 4등 이상 **0.69674134%**를 확인한다.
- **개인별 번호**로 바꾸고 `임의 시드 생성`을 누른 뒤 생성한다. 같은 시드·같은 회차는 같은 번호, 다른 시드 또는 회차는 일반적으로 다른 번호다.
- 개인 모드 추천번호는 공통 번호 기록에 자동 저장되지 않음을 확인한다. **개인 시드를 잃으면 같은 조합을 재현할 수 없다**.
- 생일번호 가중치 및 다른 게임 수를 바꿔 시나리오 지분이 바뀌는지 확인한다. 한국 실제 구매 비율을 반영한 수치가 아니라는 문구를 표시한다.
- `보유 자료로 시계열 검증`을 눌러 기존 연구 결과와 추가 확률 보정·다중검정 감사 표가 모두 표시되는지 확인한다.
- 공식 결과 수집, 입력·수정, 기록 내보내기·가져오기 및 복권 번호와 등수 판정 기능이 유지되는지 확인한다.

## 7. 문제 발생 시

- `scripts/portfolio.js`가 404이면 GitHub Pages 배포 워크플로에서 `public/scripts` 복사를 확인한다.
- `crypto.subtle` 오류는 HTTP 또는 지원되지 않는 브라우저에서 발생할 수 있다. **GitHub Pages의 HTTPS 주소**로 접근한다.
- 자동 기록이 생기지 않으면 공식 회차의 추첨일·예상 마감 시각·자료 완전성 및 Actions 로그를 확인한다. 기록을 소급 생성해서 해결하지 않는다.
- 사이트와 Actions 실행 자료가 다르면 캐시 새로고침 후 `data/lotto.json`, `data/weekly.json`, `data/study.json`의 실제 배포 내용 및 작업 로그를 확인한다.
- 로컬에 g++가 없으면 `tools/benchmark.mjs` 실행은 생략하고 `node --test`와 `python tools/verify.py`를 진행한다. 컴파일러 부재는 사이트 런타임 오류가 아니다.

## 8. 배포 후 변경 통제

새로운 구매용 알고리즘을 도입하려면 **v2보다 해당 목적함수의 확률이 높음을 수학적으로 검증**하고 새로운 버전으로 도입해야 한다. 과거 추천 및 cold100 사전 기록을 재생성하거나 덮어쓰지 않는다. 당첨 확률 향상과 당첨금 공유 위험 감소는 서로 다른 목표이므로 통합 점수로 임의 합산하지 않는다.
