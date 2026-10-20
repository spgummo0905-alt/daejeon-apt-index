# 대전 아파트 지수

대전 아파트를 **실거래가, 입지점수, 실질수익률**로 비교하는 정적 사이트 생성기입니다.
수도권용 온라인 임장 사이트들과 같은 발상을 대전에 맞춰 공공데이터로 처음부터 만든 것입니다.

```
국토부 실거래가 API ──┐
카카오 로컬 API ───────┼─▶ 지표 계산 (pandas) ─▶ 정적 HTML (Jinja2) ─▶ GitHub Pages
통계청 소비자물가지수 ─┘
```

## 바로 화면 보기 (키 불필요)

```bash
cd daejeon-apt-index  # 저장소를 clone한 폴더
pip install -r requirements.txt
python -m djdex demo          # site-demo/index.html 생성
python -m http.server -d site-demo 8000
```

데모는 무작위 가짜 데이터라 화면 상단에 노란 경고 띠가 붙습니다.

## 실제 데이터로 만들기

### 1. API 키 준비

| 환경변수 | 어디서 | 용도 |
|---|---|---|
| `DATA_GO_KR_KEY` | [공공데이터포털](https://www.data.go.kr) → "국토교통부_아파트 매매 실거래가 상세 자료" 활용신청 | 실거래가 수집 (필수) |
| `KAKAO_REST_KEY` | [카카오 개발자](https://developers.kakao.com) → 내 애플리케이션 → REST API 키 | 좌표, 주변 시설 (입지점수) |
| `KAKAO_JS_KEY` | 같은 곳의 JavaScript 키 + 플랫폼에 사이트 도메인 등록 | 단지 페이지 지도 (선택) |

공공데이터포털 키는 **Decoding 키**를 쓰세요. 요청 라이브러리가 다시 인코딩하므로 Encoding 키를 넣으면 인증 오류가 납니다.
활용신청 직후에는 키가 활성화되기까지 1~2시간 걸릴 수 있습니다.

### 2. 실행

```bash
export DATA_GO_KR_KEY=...
export KAKAO_REST_KEY=...
python -m djdex collect      # data/raw/ 에 월별 원본 캐시, data/trades.csv 생성
python -m djdex locate       # data/geo.json, data/poi.json
python -m djdex build        # site/ 생성, data/scores.csv 저장
# 또는 한 번에
python -m djdex all
```

처음 `collect` 는 5개 구 × 2006년부터 매월이라 약 1,200번 호출합니다. 개발 계정 일일 한도 안에 들어갑니다.
이후에는 캐시된 달은 건너뛰고 최근 3개월만 다시 받습니다.
`locate` 도 결과를 캐시하므로 새 단지만 조회합니다. 좌표를 못 찾은 단지는 `data/geo.json` 에 `null` 로 남으니, 주소를 고친 뒤 그 줄을 지우고 다시 돌리면 됩니다.

### 3. 실질수익률

`data/cpi.csv` 에 통계청 KOSIS의 소비자물가지수(2020=100) 전국 총지수 월별 값을 `ym,cpi` 형식으로 넣으면 수익률이 물가를 뺀 실질 기준이 됩니다.
비어 있으면 명목 수익률로 계산하고 사이트에도 "명목"으로 표시합니다.

## 지표 정의

- **84㎡ 환산가**: 최근 12개월 거래의 ㎡당 중위가격 × 84. 거래 2건 미만이면 계산하지 않습니다.
- **n년 연평균 수익률**: 지금 12개월 구간과 n년 전 12개월 구간의 ㎡당 중위가격으로 구한 CAGR.
- **입지점수**: 지하철역, 초등학교, 학원, 대형마트, 병원 항목별로 대전 전체 단지 중 백분위를 매겨 가중평균.
- **종합 지수**: (입지점수 + 10년 수익률 백분위 + 5년 수익률 백분위) ÷ 값이 있는 항목 수.

해제 거래와 직거래는 기본으로 뺍니다. 모든 숫자와 가중치는 `config.toml` 에서 바꿉니다.

## 자동 갱신 (GitHub Actions)

`.github/workflows/build.yml` 이 푸시 때마다 테스트와 데모 빌드를 돌리고, 매월 20일과 수동 실행 때 실제 데이터로 사이트를 만들어 GitHub Pages에 올립니다.

1. 저장소 Settings → Secrets and variables → Actions 에 위 키 3개를 등록합니다.
2. Settings → Pages → Source 를 "GitHub Actions" 로 바꿉니다.

## 구조

```
config.toml        지역, 필터, 지표, 입지 항목과 가중치
djdex/molit.py     실거래가 수집, 정규화
djdex/kakao.py     좌표, 주변 시설 수집 (캐시)
djdex/location.py  입지점수
djdex/metrics.py   가격, 수익률, 종합 지수
djdex/cpi.py       물가지수
djdex/site.py      HTML 생성, 인라인 SVG 그래프
djdex/demo.py      가짜 데모 데이터
templates/ static/ 화면
tests/             pytest
```

## 다음에 할 일

- 세대수, 브랜드, 주차대수 같은 단지 정보: 국토부 공동주택 기본정보 API 또는 K-apt 연동
- 학군 지표: 학교알리미의 학업성취도, 학생 수
- 전세가율: 국토부 아파트 전월세 실거래가 API
- 동일 단지 이름 변경, 재건축 전후 단지 묶기
