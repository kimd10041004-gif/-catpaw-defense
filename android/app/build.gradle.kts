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
    compileSdk = 35

    defaultConfig {
        applicationId = "com.catpaw.defense"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        // 인터넷 권한이 필요 없다 — 모든 파일이 APK 안에 들어 있다.
    }

    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/gameAssets"))

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        compilerOptions {
            jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
        }
    }

    packaging {
        resources.excludes += setOf("META-INF/*.version", "DebugProbesKt.bin")
    }
}

tasks.named("preBuild") { dependsOn(copyWebAssets) }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.webkit:webkit:1.13.0")
}
