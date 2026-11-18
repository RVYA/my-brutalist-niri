#include "niri_blur.h"
#include <gdk/wayland/gdkwayland.h>
#include <wayland-client.h>

void niri_blur_set_region(GtkWidget *widget, const gint *coords, gint n_coords) {
    if (!widget) return;
    GtkNative *native = gtk_widget_get_native(widget);
    if (!native) return;
    GdkSurface *gdk_surf = gtk_native_get_surface(native);
    if (!gdk_surf || !GDK_IS_WAYLAND_SURFACE(gdk_surf)) return;

    struct wl_surface *wl_surf = gdk_wayland_surface_get_wl_surface(gdk_surf);
    if (!wl_surf) return;

    /* Offset 0xe0 is wl_surface; offset 0x108 is ext_background_effect_surface_v1 */
    struct wl_proxy *eff = *(struct wl_proxy **)((char *)gdk_surf + 0x108);
    if (!eff) return;

    GdkDisplay *display = gdk_surface_get_display(gdk_surf);
    struct wl_compositor *comp = gdk_wayland_display_get_wl_compositor(display);
    if (!comp) return;

    struct wl_region *region = wl_compositor_create_region(comp);
    for (gint i = 0; i + 3 < n_coords; i += 4) {
        wl_region_add(region, coords[i], coords[i + 1], coords[i + 2], coords[i + 3]);
    }

    wl_proxy_marshal_flags(eff, 1, NULL, wl_proxy_get_version(eff), 0, region);
    wl_region_destroy(region);
}
