import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

android {
    compileSdk = 36
    namespace = "tech.bobalus.iva.panel"
    defaultConfig {
        // GUIs come from web servers on the LAN (http://), web views from the panel's own server (http://127.0.0.1)
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        applicationId = "tech.bobalus.iva.panel"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    // a development key, kept in the repo: a build here installs over the last one. A release build
    // with IVA_PANEL_KEYSTORE set (CI: the repository's secrets) is signed with the release key -
    // its own, out of the repo; without it, with the dev key
    signingConfigs {
        create("dev") {
            storeFile = file("../keystore/iva-panel-dev.p12")
            storePassword = "iva-panel"
            keyAlias = "iva"
            keyPassword = "iva-panel"
            storeType = "pkcs12"
        }
        val releaseStore = System.getenv("IVA_PANEL_KEYSTORE")
        if (!releaseStore.isNullOrEmpty()) {
            create("release") {
                storeFile = file(releaseStore)
                storePassword = System.getenv("IVA_PANEL_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("IVA_PANEL_KEY_ALIAS") ?: "iva-release"
                keyPassword = System.getenv("IVA_PANEL_KEYSTORE_PASSWORD")
                storeType = "pkcs12"
            }
        }
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = ".debug"
            signingConfig = signingConfigs.getByName("dev")
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("dev")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
