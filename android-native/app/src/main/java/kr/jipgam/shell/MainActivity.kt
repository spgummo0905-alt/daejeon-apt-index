package kr.jipgam.shell

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView

// 집감 네이티브 셸 시제품. 화면·기능·데이터는 사이트(WebView)를 그대로 쓰고,
// 하단 탭 / 바텀시트 / 뒤로 가기 / 햅틱 / 시스템바만 네이티브로 얹는다. 운영 앱(TWA)을 대체하지 않는다.
const val SITE = "https://www.jipgam.kr/"

data class Region(val label: String, val path: String)
val REGIONS = listOf(Region("대전", "daejeon/"), Region("세종", "sejong/"), Region("청주", "cheongju/"), Region("서울", "seoul/"))   // 웹 지역 메뉴와 같은 4곳

data class Tab(val label: String, val page: String, val icon: ImageVector)
val TABS = listOf(
    Tab("홈", "index.html", Icons.Filled.Home),
    Tab("찾기", "finder.html", Icons.Filled.Search),
    Tab("임장 준비", "projects.html", Icons.Filled.LocationOn),
    Tab("둘러보기", "rank.html", Icons.Filled.List),
    Tab("나의 집감", "my.html", Icons.Filled.Star),
)

// 같은 집감 주소와 로그인(카카오) 주소는 앱 안에서, 나머지는 외부 브라우저로 연다
fun staysInApp(uri: Uri): Boolean {
    if (uri.scheme != "https") return false                       // http·intent·file 등은 앱 안에서 열지 않는다
    val h = (uri.host ?: return false).lowercase()
    fun isOrSub(d: String) = h == d || h.endsWith(".$d")          // 'evilkakao.com' 같은 비슷한 이름은 통과시키지 않는다
    return h == "www.jipgam.kr" || h == "jipgam.kr" || isOrSub("kakao.com") || isOrSub("kakaocdn.net") || isOrSub("supabase.co")
}

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()   // 상태바·하단 시스템바를 투명하게, 글자색은 밝게/어둡게 모드에 따라 자동
        CookieManager.getInstance().setAcceptCookie(true)
        setContent { Shell() }
    }
}

private val Act = Color(0xFF1F66C1)
private val ActDark = Color(0xFF5A93E0)

@Composable
fun ShellTheme(content: @Composable () -> Unit) {
    val dark = androidx.compose.foundation.isSystemInDarkTheme()
    val scheme = if (dark) darkColorScheme(primary = ActDark, background = Color(0xFF121419), surface = Color(0xFF1B1E26), onSurface = Color(0xFFF2F1EC), onSurfaceVariant = Color(0xFFA3A9B4), secondaryContainer = Color(0xFF1F2C42))
    else lightColorScheme(primary = Act, background = Color(0xFFF4F3EF), surface = Color.White, onSurface = Color(0xFF14171F), onSurfaceVariant = Color(0xFF5B6472), secondaryContainer = Color(0xFFE8F0FB))
    MaterialTheme(colorScheme = scheme, content = content)
}

@SuppressLint("SetJavaScriptEnabled", "ViewConstructor")
fun makeWebView(ctx: android.content.Context, onProgress: (Int) -> Unit): WebView = WebView(ctx).apply {
    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true            // 관심·기록(localStorage)이 이 WebView 안에 저장됨
    settings.setSupportZoom(true)                // 두 손가락 확대(접근성)는 막지 않는다
    settings.builtInZoomControls = true
    settings.displayZoomControls = false
    settings.textZoom = 100
    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
    setBackgroundColor(android.graphics.Color.TRANSPARENT)
    webViewClient = object : WebViewClient() {
        override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
            if (staysInApp(r.url)) return false
            // 밖으로 여는 건 웹 주소·전화·메일만. intent: 같은 다른 형식은 열지 않고 막는다
            if (r.url.scheme in setOf("https", "http", "tel", "mailto")) runCatching { v.context.startActivity(Intent(Intent.ACTION_VIEW, r.url).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
            return true
        }
        override fun onPageStarted(v: WebView, url: String?, f: Bitmap?) { onProgress(10) }
        override fun onPageFinished(v: WebView, url: String?) {
            onProgress(100)
            // 웹 쪽 하단 탭은 네이티브 탭이 대신하므로 숨긴다(같은 메뉴가 두 번 보이지 않게)
            v.evaluateJavascript("(function(){if(document.getElementById('native-shell-css'))return;var s=document.createElement('style');s.id='native-shell-css';s.textContent='.tabbar{display:none!important}';document.head.appendChild(s)})()", null)
        }
    }
    webChromeClient = object : android.webkit.WebChromeClient() {
        override fun onProgressChanged(v: WebView, p: Int) { onProgress(p) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Shell() = ShellTheme {
    val ctx = LocalContext.current
    val view = LocalView.current
    var region by rememberSaveable { mutableStateOf(0) }
    var tab by rememberSaveable { mutableStateOf(0) }
    var showSheet by remember { mutableStateOf(false) }
    var progress by remember { mutableStateOf(100) }
    val loaded = remember { mutableStateListOf(true, false, false, false, false) }
    val views = remember { arrayOfNulls<WebView>(TABS.size) }
    fun urlOf(i: Int) = SITE + REGIONS[region].path + TABS[i].page

    val imeUp = WindowInsets.ime.getBottom(LocalDensity.current) > 0
    val bg = MaterialTheme.colorScheme.background

    // 뒤로 가기: 열린 시트(자동) → 탭 안 이전 화면 → 홈 탭 → 앱 종료
    val cur = views[tab]
    BackHandler(enabled = !showSheet && ((cur?.canGoBack() == true) || tab != 0)) {
        val v = views[tab]
        if (v != null && v.canGoBack()) v.goBack() else { tab = 0; view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK) }
    }

    Box(Modifier.fillMaxSize().background(bg)) {
        Column(Modifier.fillMaxSize()) {
            // 웹 화면 영역: 상태바 높이만큼 아래에서 시작, 키보드가 올라오면 그만큼 줄어든다
            Box(Modifier.weight(1f).fillMaxWidth().windowInsetsPadding(WindowInsets.statusBars).imePadding()) {
                TABS.indices.forEach { i ->
                    val a by animateFloatAsState(if (tab == i) 1f else 0f, tween(180), label = "tab$i")
                    if (loaded[i]) AndroidView(
                        modifier = Modifier.fillMaxSize().alpha(a),
                        factory = { c -> makeWebView(c) { p -> if (tab == i) progress = p }.also { views[i] = it; it.loadUrl(urlOf(i)) } },
                        update = { w -> w.visibility = if (tab == i) View.VISIBLE else View.INVISIBLE; if (tab == i) progress = if (w.progress in 1..99) w.progress else 100 },
                    )
                }
                if (progress in 1..99) LinearProgressIndicator(progress = { progress / 100f }, modifier = Modifier.fillMaxWidth().height(3.dp).align(Alignment.TopCenter), trackColor = Color.Transparent)
                // 더보기 버튼(바텀시트 열기): 하단 탭 바로 위 오른쪽
                Box(
                    Modifier.align(Alignment.BottomEnd).padding(16.dp).size(48.dp).clip(CircleShape)
                        .background(MaterialTheme.colorScheme.surface).clickable(role = Role.Button) { view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK); showSheet = true }
                        .semantics { contentDescription = "더보기 메뉴 열기" },
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Filled.MoreVert, null, tint = MaterialTheme.colorScheme.onSurface) }
            }
            if (!imeUp) BottomTabs(tab) { i ->
                view.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
                if (i == tab) views[i]?.let { w -> if (w.canGoBack()) w.loadUrl(urlOf(i)) else w.evaluateJavascript("window.scrollTo({top:0,behavior:'smooth'})", null) }
                else { loaded[i] = true; tab = i }
            }
        }
    }

    if (showSheet) ModalBottomSheet(onDismissRequest = { showSheet = false }, containerColor = MaterialTheme.colorScheme.surface) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("지역", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                REGIONS.forEachIndexed { i, r ->
                    val on = i == region
                    Box(
                        Modifier.height(44.dp).clip(RoundedCornerShape(22.dp))
                            .background(if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer)
                            .clickable {
                                view.performHapticFeedback(HapticFeedbackConstants.CONFIRM)
                                if (i != region) { region = i; loaded.indices.forEach { k -> loaded[k] = k == tab }; views.indices.forEach { k -> views[k] = null } }
                                showSheet = false
                            }.padding(horizontal = 18.dp),
                        contentAlignment = Alignment.Center,
                    ) { Text(r.label, fontSize = 17.sp, fontWeight = FontWeight.Medium, color = if (on) MaterialTheme.colorScheme.background else MaterialTheme.colorScheme.onSurface) }
                }
            }
            Spacer(Modifier.height(8.dp))
            SheetRow("새로고침", Icons.Filled.Refresh) { views[tab]?.reload(); showSheet = false }
            SheetRow("맨 위로", Icons.Filled.KeyboardArrowUp) { views[tab]?.evaluateJavascript("window.scrollTo({top:0,behavior:'smooth'})", null); showSheet = false }
            SheetRow("브라우저에서 열기", Icons.Filled.Share) {
                val u = views[tab]?.url ?: urlOf(tab)
                runCatching { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(u)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }; showSheet = false
            }
            Text("시험용 셸 · 운영 앱이 아닙니다", fontSize = 15.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
fun SheetRow(label: String, icon: ImageVector, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).clickable(role = Role.Button, onClick = onClick), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        Icon(icon, null, tint = MaterialTheme.colorScheme.primary)
        Text(label, fontSize = 18.sp)
    }
}

@Composable
fun BottomTabs(selected: Int, onSelect: (Int) -> Unit) {
    Surface(color = MaterialTheme.colorScheme.surface, shadowElevation = 6.dp) {
        Row(Modifier.fillMaxWidth().windowInsetsPadding(WindowInsets.navigationBars).height(64.dp)) {
            TABS.forEachIndexed { i, t ->
                val on = i == selected
                val c = if (on) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                Column(
                    Modifier.weight(1f).fillMaxHeight().clickable(role = Role.Tab) { onSelect(i) }
                        .semantics { contentDescription = t.label + if (on) ", 선택됨" else "" },
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    Icon(t.icon, null, tint = c, modifier = Modifier.size(26.dp))
                    Text(t.label, fontSize = 14.sp, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Medium, color = c, maxLines = 1)
                }
            }
        }
    }
}
