package com.crosspointsync.multicastlock

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MulticastLockModule : Module() {
  private var multicastLock: WifiManager.MulticastLock? = null

  override fun definition() = ModuleDefinition {
    Name("MulticastLock")

    Function("acquire") {
      if (multicastLock?.isHeld != true) {
        val context = appContext.reactContext
        if (context != null) {
          val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
          if (wifiManager != null) {
            multicastLock = wifiManager.createMulticastLock("crosspoint_udp_discovery").apply {
              setReferenceCounted(false)
              acquire()
            }
          }
        }
      }
      null
    }

    Function("release") {
      multicastLock?.let {
        if (it.isHeld) {
          it.release()
        }
      }
      multicastLock = null
    }
  }
}
