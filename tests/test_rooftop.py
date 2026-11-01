"""집감 옥상: 쉬어가는 1인용 화면 (rooftop.html + rooftop.js)"""
import subprocess
from pathlib import Path

from djdex import cli

ROOT = Path(__file__).resolve().parents[1]


def test_rooftop_page_and_entrances(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "rooftop.html").read_text(encoding="utf-8")
    assert 'id="roof"' in page and 'data-roof-sound' in page and 'aria-checked="false"' in page      # 소리는 기본 꺼짐
    assert 'data-roof-food="pork"' in page and "data-roof-fire" in page and "data-roof-photo" in page
    assert "data-roof-stars" in page and "data-roof-wishgo" in page and 'data-roof-amb="cricket"' in page   # 별 세기, 소원, 환경음 고르기
    assert 'data-page="rooftop"' in page and "static/rooftop.js" in page
    assert 'href="rooftop.html"' in (out / "index.html").read_text(encoding="utf-8")      # 첫 화면 아래 줄
    assert 'href="rooftop.html"' in (out / "compare.html").read_text(encoding="utf-8")    # 바닥글 (메뉴에는 없음)
    assert 'top-nav' in page and '<a href="rooftop.html">' not in page.split('<nav class="top-nav">')[1].split("</nav>")[0]
    assert "<loc>https://www.jipgam.kr/rooftop</loc>" in (out / "sitemap.xml").read_text(encoding="utf-8")


def test_rooftop_script_is_valid_and_gentle():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    subprocess.run(["node", "--check", str(ROOT / "static" / "rooftop.js")], check=True)
    assert "prefers-reduced-motion" in js and "visibilitychange" in js        # 움직임 줄이기, 숨겨진 탭 멈춤
    assert "sound: false" in js and "setTargetAtTime" in js                  # 소리 기본 꺼짐, 부드러운 켜짐
    assert "weather-data/weather.json" in js and "rooftop3d.js" in js         # 날씨는 기상청 자료 파일에서, 실패해도 그냥 열림
    assert "open-meteo" not in js.lower()


def test_rooftop_3d_scene_and_vendor():
    subprocess.run(["node", "--check", str(ROOT / "static" / "rooftop3d.js")], check=True)
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert 'from "./vendor/three.module.min.js"' in js3 and "countStar" in js3 and "sendLantern" in js3   # 별 세기, 소원 풍등
    for kind in ("peony", "chrys", "willow", "ring", "heart", "palm", "crossette", "crackle", "double", "saturn"):
        assert f'"{kind}"' in js3                                                                         # 불꽃 종류
    assert "addItem" in js3 and "aerial" in js3 and "lieDown" in js3                                       # 꾸미기, 야경 보기, 누워서 보기
    assert (ROOT / "static" / "vendor" / "three.module.min.js").stat().st_size > 400_000
    assert (ROOT / "static" / "vendor" / "three.LICENSE").exists()


def test_weather_grid_matches_kma_examples():
    import importlib.util
    spec = importlib.util.spec_from_file_location("weather_fetch", ROOT / "scripts" / "weather_fetch.py")
    w = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(w)
    assert w.grid(37.5665, 126.9780) == (60, 127)     # 서울 시청 (기상청 격자 공식 예시)
    assert w.grid(36.3504, 127.3845) == (67, 100)     # 대전
    assert w.grid(35.1796, 129.0756) == (98, 76)      # 부산


def test_real_recordings_and_photo_backdrops_ship_with_credits():
    import json
    snd = ROOT / "static" / "sounds"
    man = json.loads((snd / "manifest.json").read_text(encoding="utf-8"))
    cred = json.loads((snd / "credits.json").read_text(encoding="utf-8"))
    assert {"cricket", "wind", "rain", "chime", "fire"} <= set(man["loops"]) and len(man["near"]) >= 8 and man["oneshots"]
    for f in [*man["loops"].values(), *man["near"], *man["oneshots"].values()]:
        assert (snd / f).stat().st_size > 2000, f                                  # 비어 있지 않은 실제 소리 파일
    assert all(v["license"] and v["page"].startswith("https://commons.wikimedia.org/") for v in cred.values())   # 저작자·라이선스 표기
    assert (ROOT / "static" / "bg" / "sky.webp").exists() and (ROOT / "static" / "bg" / "bay.webp").exists()
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    assert "playSample" in js and "static/sounds/" in js


def test_rooftop_focus_mode_and_natural_sitting():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert "setFocus" in js3 and '"grill"' in js3 and '"sky"' in js3 and '"tent"' in js3        # 동작 중 시점 고정
    assert "crawl" in js3 and "knee" in js3 and "slide(" in js3                                  # 무릎, 텐트 기어들기, 천천히 앉기
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert "data-roof-exit" in page and "data-roof-reset" in page                                # 그만하기, 시점 돌아가기


def test_rooftop_has_own_share_image(tmp_path):
    out = tmp_path / "site"
    cli.main(["--data", str(tmp_path / "data"), "demo", "--out", str(out)])
    page = (out / "rooftop.html").read_text(encoding="utf-8")
    assert 'og:image" content="' in page and 'static/og/rooftop.jpg"' in page          # 옥상 링크만 옥상 썸네일
    assert (out / "static" / "og" / "rooftop.jpg").exists()
    assert "static/og/daejeon.jpg" in (out / "index.html").read_text(encoding="utf-8")   # 다른 쪽은 그대로


def test_rooftop_has_white_dog():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert "function makeDog" in js3 and "petDog" in js3 and "dog.g" in js3      # 흰 강아지: 따라다니고, 누르면 폴짝


def test_rooftop_pets_can_be_chosen():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert all(f in js3 for f in ("function makeChameleon", "function makeFrog", "function makeParrot", "setPets"))
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert all(f'data-roof-pet="{k}"' in page for k in ("dog", "cat", "cham", "frog", "parrot"))   # 꾸미기에서 골라 꺼내고 넣기


def test_rooftop_oktap_furniture_and_edit():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    for t in ("sofa", "beanbag", "rug", "screen", "cooler", "lamp", "canopy", "pouf", "firepit"):
        assert f't === "{t}"' in js3                                                     # 옥탑·캠핑 가구
    assert "rotateItem" in js3 and "moveItem" in js3 and "옥탑 301" in js3              # 옮기기·돌리기, 옥탑방 건물
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert 'data-roof-deco="edit"' in page and "data-roof-resetlayout" in page


def test_rooftop_first_visit_tour():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert "startTour" in js and "st.tour" in js and "data-roof-tour" in page and "data-roof-tourre" in page   # 처음 한 번 안내, 설정에서 다시 보기


def test_rooftop_my_media_local_only():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert 'data-roof-vidfile' in page and 'accept="video/*"' in page and 'data-roof-musfile' in page   # 내 파일 고르기
    assert 'data-roof-deco="speaker"' in page and 't === "speaker"' in js3                          # 스피커 소품
    assert "URL.createObjectURL" in js and "setScreenVideo" in js3 and "VideoTexture" in js3        # 기기 안에서만 재생
    assert "fetch(" not in js.split("내 영상·음악")[1].split("const cb")[0]                          # 서버로 올리지 않아요


def test_rooftop_layout_keeps_rotation_everywhere():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    assert "function placeLayout" in js3 and js3.count("placeLayout(") >= 3      # 처음·방 들어가기·나오기 모두 같은 길 (돌린 방향 r 포함)
    assert "LAYOUT_V" in js and "b.lv === LAYOUT_V" in js                       # 옛 배치·옛 화면이 보낸 배치는 쓰지 않아요


def test_rooftop_calm_arrival_and_zen():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    assert "data-roof-arrive" in page and 'data-roof-arrgo="sound"' in page and 'data-roof-arrgo="quiet"' in page   # 들어올 때 인사 + 숨 고르기
    assert "arrive()" in js3 and "api.arrive()" in js                                                           # 하늘에서 천천히 내려오는 카메라
    assert "data-roof-zen" in page and "data-roof-zenset" in page and "data-roof-arrset" in page and 'classList.toggle("zen"' in js   # 멍 모드·설정


def test_rooftop_calm_sky_defaults():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    assert "const crownIdx = [];" in js3 and "const beacons = [];" in js3       # 하늘에 뜬 드론 같던 탑 조명은 빼요
    assert "st.glow ?? 20" in js and "st.skyV" in js                             # 기본 빛번짐 20%, 한 번 맞춤


def test_rooftop_no_shimmer():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert "fwidth(q)" in js3 and "BOX(" in js3                          # 창 무늬를 픽셀 폭에 맞춰 부드럽게, 멀면 평균
    assert "clamp(sz, 2.2, 90.)" in js3                                  # 아주 작은 불빛이 깜빡이지 않게
    assert "antialias: true" in js3 and "samples: mobile ? 2 : 4" in js3  # 휴대폰도 계단 현상 줄이기

def test_rooftop_guestbook():
    js = (ROOT / "static" / "rooftop.js").read_text(encoding="utf-8")
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    page = (ROOT / "templates" / "rooftop.html").read_text(encoding="utf-8")
    sql = (ROOT / "scripts" / "supabase_setup.sql").read_text(encoding="utf-8")
    assert 'data-roof-modal="guest"' in page and 'data-roof-open="guest"' in page and "data-roof-gform" in page   # 쉬기 > 방명록
    assert 't === "guestbook"' in js3 and 'id === "guest"' in js3                                               # 옥탑방 입구 옆 방명록 받침대
    assert "roof_guest_write" in js and "roof_guest_list" in js and "roof_guest_delete" in js
    assert "create table if not exists public.roof_guestbook" in sql and "public.roof_guestbook enable row level security" in sql
    assert "https?://" in sql                                                                                    # 링크·광고는 받지 않아요
    assert page.count('class="roof-sec"') >= 2                                                                    # 쉬기 메뉴를 밤하늘·쉼으로 묶어요


def test_rooftop_jipkong_mascot():
    js3 = (ROOT / "static" / "rooftop3d.js").read_text(encoding="utf-8")
    assert "function makeKong" in js3 and "const me = makeKong(" in js3 and "const P = makeKong(" in js3   # 나·함께 있는 사람 모두 집콩이
    assert "texKnit" in js3 and "texBlush" in js3 and "LatheGeometry" in js3                            # 니트 목도리·볼터치·찹쌀떡 몸
    assert "K.blob.scale.set" in js3 and "K.hat.scale.set" in js3                                        # 쫀득하게 눌렸다 돌아오기
