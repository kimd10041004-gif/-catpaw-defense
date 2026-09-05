import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

/**
 * 게임 본체는 ../../web 에 있고, 이 프로젝트는 그것을 감싸는 껍데기다.
 * 아래 Copy 태스크가 빌드마다 web/ 을 assets로 복사하므로
 * 웹 코드를 고치면 APK에 자동으로 반영된다 (수동 복사 필요 없음).
 */
val webDir = rootProject.file("../web")

/**
 * 앱 버전. package.json · web/js/version.js 와 같아야 한다 — tests/node/version.test.mjs 가
 * 이 줄을 정규식으로 읽어 대조한다. 손으로 올리지 말고 `node tools/bump-version.mjs patch` 를 쓴다.
 */
val appVersion = "1.0.0"

/**
 * 1.2.3 → 10203. Play 는 versionCode 가 단조 증가하기만 하면 된다.
 * 같은 버전을 다시 올려야 할 때(리젝 뒤 재업로드)는 CATPAW_VERSION_CODE 환경 변수로 덮어쓴다.
 */
fun versionCodeOf(v: String): Int {
    val p = v.split('.').map { it.toInt() }
    require(p.size == 3 && p[1] < 100 && p[2] < 100) { "버전은 x.y.z (y, z < 100) 꼴이어야 합니다: $v" }
    return p[0] * 10000 + p[1] * 100 + p[2]
}

/**
 * 릴리스 서명. 네 환경 변수가 전부 있어야 한다 — CATPAW_KEYSTORE(경로) · CATPAW_KEYSTORE_PW ·
 * CATPAW_KEY_ALIAS · CATPAW_KEY_PW. 없으면 디버그 키로 서명한다: 비밀 없이도 assembleRelease /
 * bundleRelease 가 돌아가고, Play 는 디버그 키 업로드를 거부하므로 사고로 올라갈 일은 없다.
 */
val keystorePath: String? = System.getenv("CATPAW_KEYSTORE")?.takeIf { it.isNotBlank() }

val copyWebAssets by tasks.registering(Copy::class) {
    description = "web/ 의 게임 파일을 APK assets로 복사한다"
    group = "build"
    doFirst {
        require(webDir.isDirectory) { "게임 소스를 찾을 수 없습니다: ${webDir.absolutePath}" }
    }
    from(webDir)
    into(layout.buildDirectory.dir("generated/gameAssets"))
}

android {
    namespace = "com.catpaw.defense"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.catpaw.defense"
        minSdk = 24
        targetSdk = 36   // Play 의 2025년 8월 이후 요구. Android 16 은 큰 화면에서 portrait 고정을 무시한다 — 가로도 스모크로 본다.
        versionName = appVersion
        versionCode = System.getenv("CATPAW_VERSION_CODE")?.toIntOrNull() ?: versionCodeOf(appVersion)
        // 인터넷 권한이 필요 없다 — 모든 파일이 APK 안에 들어 있다.
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("CATPAW_KEYSTORE_PW")
                keyAlias = System.getenv("CATPAW_KEY_ALIAS")
                keyPassword = System.getenv("CATPAW_KEY_PW")
            }
        }
    }

    // copyWebAssets 의 산출물을 assets 소스로 쓴다.
    // TaskProvider.map 으로 넘겨야 Gradle이 태스크 의존성을 함께 인식한다
    // (경로만 넘기면 복사 전에 패키징되거나 implicit dependency 오류가 난다).
    sourceSets["main"].assets.srcDir(copyWebAssets.map { it.destinationDir })

    buildTypes {
        release {
            // 게임은 assets 안의 자바스크립트라 줄일 코틀린이 거의 없지만, R8 이 androidx 를 정리해 준다.
            // 브리지(@JavascriptInterface)는 proguard-rules.pro 가 지킨다.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = if (keystorePath != null) signingConfigs.getByName("release") else signingConfigs.getByName("debug")
        }
        debug {
            isMinifyEnabled = false
            // 디버그와 릴리스가 한 폰에 나란히 깔린다. WebView 데이터(localStorage 세이브)도 따로다 —
            // 디버그 빌드에서 만든 진행도가 릴리스로 넘어오지 않는다(문서: docs/출시체크리스트.md).
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/*.version", "DebugProbesKt.bin")
    }
}

// Kotlin 컴파일러 설정은 android {} 밖, 프로젝트 최상위 kotlin 확장에 둔다.
kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.13.0")
}
