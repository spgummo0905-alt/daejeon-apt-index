import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest


@pytest.fixture(autouse=True)
def _portal_up():
    """공공데이터포털 연결 끊김 표시는 실행 하나 동안 남으므로 테스트마다 되돌립니다."""
    from djdex import molit
    molit._PORTAL.update(fails=0, down=False)
    yield
    molit._PORTAL.update(fails=0, down=False)
