package com.abhishek.abhilife;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.UriPermission;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.documentfile.provider.DocumentFile;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.regex.Pattern;

@CapacitorPlugin(name = "AbhiLifeStorage")
public class AbhiLifeStoragePlugin extends Plugin {
    private static final String PREFS = "abhilife_storage";
    private static final String ROOT_URI_KEY = "root_uri";
    private static final String REQUIRED_ROOT_NAME = "AbhiLife";
    private static final Pattern SAFE_SEGMENT = Pattern.compile("^[a-zA-Z0-9._-]+$");

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private ContentResolver resolver() {
        return getContext().getContentResolver();
    }

    @PluginMethod
    public void chooseRoot(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION);
        startActivityForResult(call, intent, "chooseRootResult");
    }

    @ActivityCallback
    private void chooseRootResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.reject("No AbhiLife folder was selected.");
            return;
        }

        Uri uri = result.getData().getData();
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), uri);
        if (root == null || !root.exists() || !root.isDirectory()) {
            call.reject("The selected location is not a usable folder.");
            return;
        }

        String name = root.getName();
        if (name == null || !REQUIRED_ROOT_NAME.equalsIgnoreCase(name)) {
            call.reject("Please create or select a folder named AbhiLife.");
            return;
        }

        int takeFlags = result.getData().getFlags()
                & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        try {
            resolver().takePersistableUriPermission(uri, takeFlags);
        } catch (SecurityException error) {
            call.reject("Android did not grant persistent access to this folder.", null, error);
            return;
        }

        if (!root.canRead() || !root.canWrite() || !hasPersistedPermission(uri)) {
            call.reject("The selected AbhiLife folder must allow persistent reading and writing.");
            return;
        }

        prefs().edit().putString(ROOT_URI_KEY, uri.toString()).apply();
        call.resolve(rootStatus(uri, root));
    }

    @PluginMethod
    public void getRootStatus(PluginCall call) {
        String stored = prefs().getString(ROOT_URI_KEY, null);
        if (stored == null) {
            JSObject result = new JSObject();
            result.put("connected", false);
            call.resolve(result);
            return;
        }

        try {
            Uri uri = Uri.parse(stored);
            DocumentFile root = DocumentFile.fromTreeUri(getContext(), uri);
            if (root == null || !root.exists() || !root.canRead() || !root.canWrite() || !hasPersistedPermission(uri)) {
                JSObject result = new JSObject();
                result.put("connected", false);
                result.put("needsReconnect", true);
                call.resolve(result);
                return;
            }
            call.resolve(rootStatus(uri, root));
        } catch (Exception error) {
            call.reject("Unable to check AbhiLife folder status.", null, error);
        }
    }

    @PluginMethod
    public void releaseRoot(PluginCall call) {
        String stored = prefs().getString(ROOT_URI_KEY, null);
        if (stored != null) {
            try {
                resolver().releasePersistableUriPermission(
                        Uri.parse(stored),
                        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
            } catch (Exception ignored) {
                // Permission may already have been revoked by Android or the provider.
            }
        }
        prefs().edit().remove(ROOT_URI_KEY).apply();
        call.resolve();
    }

    @PluginMethod
    public void ensureDirectory(PluginCall call) {
        try {
            String path = call.getString("path", "");
            ensureDirectoryPath(requireRoot(), path);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void exists(PluginCall call) {
        try {
            String path = call.getString("path", "");
            JSObject result = new JSObject();
            result.put("exists", findPath(requireRoot(), path) != null);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void readText(PluginCall call) {
        try {
            String path = requiredPath(call);
            DocumentFile file = findPath(requireRoot(), path);
            if (file == null || file.isDirectory()) {
                throw new IllegalStateException("File not found: " + path);
            }
            JSObject result = new JSObject();
            result.put("data", readUtf8(file));
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void writeTextAtomic(PluginCall call) {
        DocumentFile temp = null;
        DocumentFile backup = null;
        DocumentFile parent = null;
        String targetName = null;

        try {
            String path = requiredPath(call);
            String data = call.getString("data");
            if (data == null) throw new IllegalArgumentException("data is required.");

            String[] parts = safeSegments(path);
            targetName = parts[parts.length - 1];
            parent = requireRoot();
            for (int i = 0; i < parts.length - 1; i++) {
                parent = ensureChildDirectory(parent, parts[i]);
            }

            DocumentFile existing = parent.findFile(targetName);
            String mime = targetName.endsWith(".json") ? "application/json" : "text/plain";
            String tempName = targetName + ".tmp-" + UUID.randomUUID();
            temp = parent.createFile(mime, tempName);
            if (temp == null) throw new IllegalStateException("Unable to create temporary file for " + path);
            writeUtf8(temp, data);

            if (!data.equals(readUtf8(temp))) {
                throw new IllegalStateException("Temporary write verification failed for " + path);
            }

            if (existing != null) {
                String backupName = targetName + ".bak";
                DocumentFile staleBackup = parent.findFile(backupName);
                if (staleBackup != null) staleBackup.delete();
                if (!existing.renameTo(backupName)) {
                    throw new IllegalStateException("Unable to create a recovery copy for " + path);
                }
                backup = parent.findFile(backupName);
            }

            boolean promoted = temp.renameTo(targetName);
            if (!promoted) {
                DocumentFile target = parent.createFile(mime, targetName);
                if (target == null) throw new IllegalStateException("Unable to create target file " + path);
                writeUtf8(target, data);
                temp.delete();
            }

            if (backup != null) backup.delete();

            JSObject result = new JSObject();
            result.put("bytes", data.getBytes(StandardCharsets.UTF_8).length);
            result.put("updatedAt", System.currentTimeMillis());
            call.resolve(result);
        } catch (Exception error) {
            if (temp != null) temp.delete();
            if (backup != null && parent != null && targetName != null && parent.findFile(targetName) == null) {
                backup.renameTo(targetName);
            }
            call.reject(error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            String path = call.getString("path", "");
            DocumentFile directory = findPath(requireRoot(), path);
            if (directory == null || !directory.isDirectory()) {
                throw new IllegalStateException("Directory not found: " + path);
            }

            JSArray entries = new JSArray();
            for (DocumentFile child : directory.listFiles()) {
                JSObject entry = new JSObject();
                entry.put("name", child.getName());
                entry.put("directory", child.isDirectory());
                entry.put("size", child.length());
                entry.put("lastModified", child.lastModified());
                entries.put(entry);
            }
            JSObject result = new JSObject();
            result.put("entries", entries);
            call.resolve(result);
        } catch (Exception error) {
            call.reject(error.getMessage(), null, error);
        }
    }

    @PluginMethod
    public void deletePath(PluginCall call) {
        try {
            String path = requiredPath(call);
            DocumentFile target = findPath(requireRoot(), path);
            if (target == null) {
                call.resolve();
                return;
            }
            if (!target.delete()) throw new IllegalStateException("Unable to delete " + path);
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage(), null, error);
        }
    }

    private JSObject rootStatus(Uri uri, DocumentFile root) {
        JSObject result = new JSObject();
        result.put("connected", true);
        result.put("uri", uri.toString());
        result.put("displayName", root.getName());
        result.put("canRead", root.canRead());
        result.put("canWrite", root.canWrite());
        return result;
    }

    private boolean hasPersistedPermission(Uri uri) {
        for (UriPermission permission : resolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(uri)
                    && permission.isReadPermission()
                    && permission.isWritePermission()) {
                return true;
            }
        }
        return false;
    }

    private DocumentFile requireRoot() {
        String stored = prefs().getString(ROOT_URI_KEY, null);
        if (stored == null) throw new IllegalStateException("No AbhiLife folder is connected.");
        Uri uri = Uri.parse(stored);
        if (!hasPersistedPermission(uri)) throw new IllegalStateException("AbhiLife folder permission was lost. Reconnect the folder.");
        DocumentFile root = DocumentFile.fromTreeUri(getContext(), uri);
        if (root == null || !root.exists() || !root.canRead() || !root.canWrite()) {
            throw new IllegalStateException("The connected AbhiLife folder is unavailable. Reconnect it.");
        }
        return root;
    }

    private String requiredPath(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.trim().isEmpty()) throw new IllegalArgumentException("path is required.");
        return path;
    }

    private String[] safeSegments(String path) {
        if (path == null || path.trim().isEmpty()) return new String[0];
        if (path.startsWith("/") || path.contains("\\")) throw new IllegalArgumentException("Unsafe path.");
        String[] parts = path.split("/");
        for (String part : parts) {
            if (part.isEmpty() || part.equals(".") || part.equals("..") || !SAFE_SEGMENT.matcher(part).matches()) {
                throw new IllegalArgumentException("Unsafe path segment.");
            }
        }
        return parts;
    }

    private DocumentFile ensureDirectoryPath(DocumentFile root, String path) {
        DocumentFile current = root;
        for (String part : safeSegments(path)) current = ensureChildDirectory(current, part);
        return current;
    }

    private DocumentFile ensureChildDirectory(DocumentFile parent, String name) {
        DocumentFile child = parent.findFile(name);
        if (child == null) child = parent.createDirectory(name);
        if (child == null || !child.isDirectory()) {
            throw new IllegalStateException("Unable to create directory: " + name);
        }
        return child;
    }

    private DocumentFile findPath(DocumentFile root, String path) {
        DocumentFile current = root;
        for (String part : safeSegments(path)) {
            current = current.findFile(part);
            if (current == null) return null;
        }
        return current;
    }

    private String readUtf8(DocumentFile file) throws Exception {
        InputStream stream = resolver().openInputStream(file.getUri());
        if (stream == null) throw new IllegalStateException("Unable to open file for reading.");
        StringBuilder value = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[8192];
            int count;
            while ((count = reader.read(buffer)) != -1) value.append(buffer, 0, count);
        }
        return value.toString();
    }

    private void writeUtf8(DocumentFile file, String data) throws Exception {
        OutputStream stream = resolver().openOutputStream(file.getUri(), "wt");
        if (stream == null) throw new IllegalStateException("Unable to open file for writing.");
        try (OutputStream output = stream) {
            output.write(data.getBytes(StandardCharsets.UTF_8));
            output.flush();
        }
    }
}
