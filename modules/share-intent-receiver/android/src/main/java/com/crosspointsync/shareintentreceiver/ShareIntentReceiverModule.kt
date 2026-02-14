package com.crosspointsync.shareintentreceiver

import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ShareIntentReceiverModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("ShareIntentReceiver")

    Events("onShareIntent")

    Function("getSharedItems") {
      val activity = appContext.currentActivity
      if (activity != null) {
        extractItemsFromIntent(activity.intent)
      } else {
        emptyList<Map<String, Any?>>()
      }
    }

    Function("clearIntent") {
      val activity = appContext.currentActivity
      if (activity != null) {
        activity.intent = Intent()
      }
      null
    }

    OnActivityResult { _, _ ->
      val activity = appContext.currentActivity
      val intent = activity?.intent
      if (intent != null && (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE)) {
        val items = extractItemsFromIntent(intent)
        if (items.isNotEmpty()) {
          sendEvent("onShareIntent", mapOf("items" to items))
        }
      }
    }

    OnNewIntent { intent ->
      val items = extractItemsFromIntent(intent)
      if (items.isNotEmpty()) {
        appContext.currentActivity?.intent = intent
        sendEvent("onShareIntent", mapOf("items" to items))
      }
    }
  }

  private fun extractItemsFromIntent(intent: Intent): List<Map<String, Any?>> {
    val items = mutableListOf<Map<String, Any?>>()

    when (intent.action) {
      Intent.ACTION_SEND -> {
        val type = intent.type ?: ""
        if (type == "text/plain") {
          val text = intent.getStringExtra(Intent.EXTRA_TEXT)
          if (text != null) {
            items.add(mapOf("type" to "text", "text" to text))
          }
        } else {
          @Suppress("DEPRECATION")
          val uri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
          if (uri != null) {
            val fileInfo = resolveUri(uri, type)
            if (fileInfo != null) {
              items.add(fileInfo)
            }
          }
        }
      }
      Intent.ACTION_SEND_MULTIPLE -> {
        @Suppress("DEPRECATION")
        val uris = intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
        val type = intent.type ?: ""
        uris?.forEach { uri ->
          val fileInfo = resolveUri(uri, type)
          if (fileInfo != null) {
            items.add(fileInfo)
          }
        }
      }
    }

    return items
  }

  private fun resolveUri(uri: Uri, mimeType: String): Map<String, Any?>? {
    val context = appContext.reactContext ?: return null
    val resolver = context.contentResolver

    var name: String? = null
    var size: Long? = null

    try {
      resolver.query(uri, null, null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIdx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          if (nameIdx >= 0) name = cursor.getString(nameIdx)
          val sizeIdx = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (sizeIdx >= 0) size = cursor.getLong(sizeIdx)
        }
      }
    } catch (_: Exception) {
      // Some providers may not support querying
    }

    if (name == null) {
      name = uri.lastPathSegment ?: "unknown"
    }

    return mapOf(
      "type" to "file",
      "uri" to uri.toString(),
      "name" to name,
      "size" to (size ?: 0L),
      "mimeType" to (resolver.getType(uri) ?: mimeType)
    )
  }
}
