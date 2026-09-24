---
title: Guide
location: editor
---

# Guide

A second page, this time in the **editor area**.

## Reading the settings

The settings of this extension are in Lumen under
*Settings → Extensions*. Each one carries the extension's name in front of its
label, so several extensions stay readable side by side.

| Key | Type | Default |
| --- | --- | --- |
| `greeting` | Text | `Hello` |
| `verbose` | Toggle | `false` |
| `mode` | Choice | `balanced` |

## Starting your own extension

Copy this folder and change `id`, `name` and `version` in `extension.json`.
That is all. The id must start with `ext.`.
