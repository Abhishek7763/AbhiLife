package com.abhishek.abhilife;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register local plugins before BridgeActivity creates the Capacitor bridge.
        registerPlugin(AbhiLifeStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
