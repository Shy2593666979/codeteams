param([long]$WindowHandle)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WindowShellProperties {
  [StructLayout(LayoutKind.Sequential)]
  public struct Key { public Guid Format; public uint Id; }
  [StructLayout(LayoutKind.Explicit, Size = 24)]
  public struct Value {
    [FieldOffset(0)] public ushort Type;
    [FieldOffset(8)] public IntPtr Pointer;
  }
  [ComImport, Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  public interface Store {
    void GetCount(out uint count);
    void GetAt(uint index, out Key key);
    void GetValue(ref Key key, out Value value);
    void SetValue(ref Key key, ref Value value);
    void Commit();
  }
  [DllImport("shell32.dll", PreserveSig = false)]
  private static extern void SHGetPropertyStoreForWindow(IntPtr window, ref Guid id, [MarshalAs(UnmanagedType.Interface)] out Store store);
  [DllImport("ole32.dll")]
  private static extern int PropVariantClear(ref Value value);
  public static string Read(long window, uint id) {
    Guid iid = typeof(Store).GUID;
    Store store;
    SHGetPropertyStoreForWindow(new IntPtr(window), ref iid, out store);
    var key = new Key { Format = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), Id = id };
    Value value;
    store.GetValue(ref key, out value);
    try { return value.Type == 31 ? Marshal.PtrToStringUni(value.Pointer) : null; }
    finally { PropVariantClear(ref value); Marshal.ReleaseComObject(store); }
  }
}
'@
@{
  appId = [WindowShellProperties]::Read($WindowHandle, 5)
  icon = [WindowShellProperties]::Read($WindowHandle, 3)
  relaunchCommand = [WindowShellProperties]::Read($WindowHandle, 2)
  displayName = [WindowShellProperties]::Read($WindowHandle, 4)
} | ConvertTo-Json -Compress
