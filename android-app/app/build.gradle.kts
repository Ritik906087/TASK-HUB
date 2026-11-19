plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val defaultAppUrl = "https://ais-pre-bnogrdoa54vhezu2ljiwi2-61141066145.asia-southeast1.run.app"
val configuredAppUrl = (project.findProperty("APP_URL") as String?)?.takeIf { it.isNotBlank() } ?: defaultAppUrl

android {
    namespace = "com.taskhub.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.taskhub.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField("String", "APP_URL", "\"$configuredAppUrl\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("com.google.android.material:material:1.12.0")
}
