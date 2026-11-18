#pragma once
#include <gtk/gtk.h>

G_BEGIN_DECLS

/**
 * niri_blur_set_region:
 * @widget: a #GtkWidget
 * @coords: (array length=n_coords): flat array of [x, y, w, h, ...] rectangles
 * @n_coords: number of integers in @coords
 */
void niri_blur_set_region(GtkWidget *widget, const gint *coords, gint n_coords);

G_END_DECLS
