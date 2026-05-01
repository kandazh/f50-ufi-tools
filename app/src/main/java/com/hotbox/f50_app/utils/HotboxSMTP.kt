package com.hotbox.f50_app.utils
import java.util.*
import javax.mail.*
import javax.mail.internet.InternetAddress
import javax.mail.internet.MimeMessage
import java.util.concurrent.atomic.AtomicBoolean

class HotboxSMTP(
    private val smtpHost: String,
    private val smtpPort: String,
    private val username: String,
    private val password: String,
) {
    // Prevent duplicate sends
    private val isSending = AtomicBoolean(false)

    fun sendEmail(to: String, subject: String, body: String,isHTML:Boolean=true) {
        // If already sending, return immediately
        if (!isSending.compareAndSet(false, true)) {
            HotboxLog.w("UFI_TOOLS_LOG", "Email sending, ignoring duplicate")
            return
        }

        Thread {
            try {
                val props = Properties()
                props["mail.smtp.auth"] = "true"
                props["mail.smtp.host"] = smtpHost
                props["mail.smtp.port"] = smtpPort

                if (smtpPort == "465") {
                    props["mail.smtp.ssl.enable"] = "true"
                    props["mail.smtp.socketFactory.class"] = "javax.net.ssl.SSLSocketFactory"
                } else {
                    props["mail.smtp.starttls.enable"] = "true"
                }

                val session = Session.getInstance(props, object : Authenticator() {
                    override fun getPasswordAuthentication(): PasswordAuthentication {
                        return PasswordAuthentication(username, password)
                    }
                })


                val message = MimeMessage(session).apply {
                    setFrom(InternetAddress(username))
                    setRecipients(Message.RecipientType.TO, InternetAddress.parse(to))
                    setSubject(subject)
                    if(isHTML) {
                        setContent(body,"text/html; charset=utf-8")
                    }
                    else {
                        setText(body)
                    }
                }

                HotboxLog.d("UFI_TOOLS_LOG", "Sending email...")
                Transport.send(message)
                HotboxLog.d("UFI_TOOLS_LOG", "$username Email sent successfully")

            } catch (e: Exception) {
                HotboxLog.e("UFI_TOOLS_LOG", "$username Email send failed: ${e.message}", e)
            } finally {
                isSending.set(false)
            }
        }.start()
    }
}