/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
"use strict";

const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/SharedPreferences.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetter(this, "LightweightThemeManager",
  "resource://gre/modules/LightweightThemeManager.jsm");

XPCOMUtils.defineLazyGetter(this, "CrashReporter", function() {
  try {
    return Cc["@mozilla.org/xre/app-info;1"].getService(Ci["nsICrashReporter"]);
  } catch (e) {
    // Fennec may not be built with the crash reporter, so just return an empty
    // object instead of throwing an exception.
    return {};
  }
});

XPCOMUtils.defineLazyGetter(this, "JNI", function() {
  // Check to see if the public domain JNI.jsm is available in the tree (Firefox 34+).
  let scope = {};
  Cu.import("resource://gre/modules/JNI.jsm", scope);
  if (scope.JNI.GetForThread) {
    return scope.JNI;
  }

  // Othwerwise, fall back to import our own.
  Cu.import("chrome://privacycoach/content/JNI.jsm", scope);
  return scope.JNI;
});

let gPrefs = [
  {
    label: "Do Not Track",
    description: "DNT lets your browser tell websites that you do not want to be tracked.",
    get value() {
      let enableDNT = Services.prefs.getBoolPref("privacy.donottrackheader.enabled");
      if (!enableDNT) {
        return "Do not tell sites anything about my tracking preferences";
      }
      let dntState = Services.prefs.getIntPref("privacy.donottrackheader.value");
      if (dntState === 0) {
        return "Tell sites that I want to be tracked";
      }
      return "Tell sites that I do not want to be tracked";
    }
  },
  {
    label: "Cookies",
    description: "Cookies let websites store small pieces of data in your browser to rememeber state when you navigate between webpages. However, this means they can also be used to track you.",
    get value() {
      let val = Services.prefs.getIntPref("network.cookie.cookieBehavior");
      if (val === 0) {
        return "Enabled";
      }
      if (val === 1) {
        return "Enabled, excluding 3rd party";
      }
      return "Disabled";
    }
  },
  {
    label: "Firefox Health Report",
    description: "FHR shares data with Mozilla about your browser health and helps you understand your browser performance.",
    get value() {
      let val = SharedPreferences.forApp().getBoolPref("android.not_a_preference.healthreport.uploadEnabled");
      return val ? "Enabled" : "Disabled";
    }
  },
  {
    label: "Telemetry",
    description: "Telemetry shares more detailed performance, usage, hardware and customization data about your browser with Mozilla to help us make the browser better.",
    get value() {
      let val = Services.prefs.getBoolPref("toolkit.telemetry.enabled");
      return val ? "Enabled" : "Disabled";
    }
  },
  {
    label: "Crash reporter",
    description: "The crash reporter lets you choose to submit crash reports to Mozilla to help us make the browser more stable and secure.",
    get value() {
      let val = CrashReporter.submitReports;
      return val ? "Enabled" : "Disabled";
    }
  },
  {
    label: "MozStumbler",
    description: "The MozStumbler shares approximate Wi-Fi and cellular location with Mozilla to help improve our geolocation service.",
    get value() {
      let val = SharedPreferences.forApp().getBoolPref("android.not_a_preference.app.geo.reportdata");
      return val ? "Enabled" : "Disabled";
    }
  }
];

function initPrefsList() {
  let prefsList = document.getElementById("prefs");
  gPrefs.forEach(function(pref) {
    let li = document.createElement("li");

    let label = document.createElement("div");
    label.textContent = pref.label;
    label.classList.add("pref-label");
    li.appendChild(label);

    let desc = document.createElement("div");
    desc.textContent = pref.description;
    li.appendChild(desc);

    let value = document.createElement("div");
    value.textContent = "Current value: " + pref.value;
    value.classList.add("pref-value");
    li.appendChild(value);

    prefsList.appendChild(li);
  });
}

/**
 * Uses JNI to broadcast changes to data reporting preferences.
 *
 * GeckoPreferences.broadcastHealthReportUploadPref(context);
 * GeckoPreferences.broadcastStumblerPref(context);
 */
function broadcastSharedPrefs() {
  let v = Services.appinfo.version;
  let version = parseInt(v.substring(0, v.indexOf(".")))

  let jenv;
  try {
    jenv = JNI.GetForThread();
    let geckoAppShell = JNI.LoadClass(jenv, "org.mozilla.gecko.GeckoAppShell", {
      static_methods: [
        { name: "getContext", sig: "()Landroid/content/Context;" },
      ],
    });

    let context = geckoAppShell.getContext();

    // The stumbler pref was only added in Fx35.
    if (version >= 35) {
      let geckoPreferences = JNI.LoadClass(jenv, "org.mozilla.gecko.preferences.GeckoPreferences", {
        static_methods: [
          { name: "broadcastHealthReportUploadPref", sig: "(Landroid/content/Context;)V" },
          { name: "broadcastStumblerPref", sig: "(Landroid/content/Context;)V" },
        ],
      });
      geckoPreferences.broadcastHealthReportUploadPref(context);
      geckoPreferences.broadcastStumblerPref(context);
    } else {
      let geckoPreferences = JNI.LoadClass(jenv, "org.mozilla.gecko.preferences.GeckoPreferences", {
        static_methods: [
          { name: "broadcastHealthReportUploadPref", sig: "(Landroid/content/Context;)V" },
        ],
      });
      geckoPreferences.broadcastHealthReportUploadPref(context);
    }

  } catch (e) {
    Cu.reportError("Exception broadcasting shared pref change: " + e);
  } finally {
    if (jenv) {
      JNI.UnloadClasses(jenv);
    }
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initPrefsList();
}, false);