# ProGuard rules for UFI-TOOLS

# Keep line numbers for crash debugging
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Strip SLF4J logging
-assumenosideeffects class org.slf4j.Logger {
    public void info(...);
    public void debug(...);
    public void error(...);
    public void warn(...);
    public void trace(...);
    public boolean isDebugEnabled();
    public boolean isInfoEnabled();
    public boolean isWarnEnabled();
    public boolean isErrorEnabled();
    public boolean isTraceEnabled();
}
-assumenosideeffects class org.slf4j.LoggerFactory {
    public static org.slf4j.Logger getLogger(...);
}
-dontwarn org.slf4j.**

# -------- JavaMail (uses reflection for providers) --------
-keep class javax.mail.** { *; }
-keep class com.sun.mail.** { *; }
-keep class jakarta.mail.** { *; }
-keep class javax.activation.** { *; }
-keep class com.sun.activation.** { *; }
-keep class com.sun.mail.util.MailLogger { *; }

# -------- Ktor (coroutines + service loading) --------
-keep class io.ktor.** { *; }
-keep class kotlinx.coroutines.** { *; }
-dontwarn io.ktor.**
-dontwarn kotlinx.coroutines.**

# -------- Netty (SSL engine) --------
-keep class io.netty.** { *; }
-dontwarn io.netty.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn reactor.blockhound.**
-dontwarn org.apache.logging.**
-dontwarn org.apache.log4j.**
-dontwarn org.jboss.marshalling.**
-dontwarn com.google.protobuf.**
-dontwarn com.jcraft.jzlib.**
-dontwarn com.ning.**
-dontwarn lzma.sdk.**
-dontwarn net.jpountz.**
-dontwarn com.aayushatharva.brotli4j.**
-dontwarn com.github.luben.zstd.**
-dontwarn sun.security.**

# -------- Kotlinx Serialization --------
-keepattributes *Annotation*
-keep class kotlinx.serialization.** { *; }
-keepclassmembers @kotlinx.serialization.Serializable class * {
    static *Companion *;
    <fields>;
}

# -------- OkHttp --------
-keep class okhttp3.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**

# -------- jcifs-ng (SMB, uses reflection) --------
-keep class jcifs.** { *; }
-keep class org.newsclub.net.unix.** { *; }
-keep class com.kohlschutter.util.** { *; }
-keepnames class org.newsclub.net.unix.**
-dontwarn jcifs.**

# -------- junixsocket annotations --------
-dontwarn com.kohlschutter.annotations.compiletime.SuppressFBWarnings
-dontwarn com.kohlschutter.annotations.compiletime.ExcludeFromCodeCoverageGeneratedReport
-dontwarn org.eclipse.jdt.annotation.NonNullByDefault
-dontwarn java.rmi.server.RemoteServer

# -------- Firebase Crashlytics buildtools --------
-dontwarn com.google.firebase.crashlytics.buildtools.reloc.**

# -------- Missing platform classes (safe to ignore on Android) --------
-dontwarn java.beans.**
-dontwarn java.lang.management.**
-dontwarn javax.lang.model.element.Modifier
-dontwarn javax.naming.**
-dontwarn javax.security.auth.**
-dontwarn javax.servlet.**
-dontwarn org.apache.avalon.framework.logger.**
-dontwarn org.apache.log.**
-dontwarn org.apache.log4j.**
-dontwarn org.checkerframework.**
-dontwarn afu.org.checkerframework.**
-dontwarn org.ietf.jgss.**