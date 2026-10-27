---
title: Photos
description: Search Unsplash or Pexels and place free stock photos, or fill a layer with one, in OpenPencil.
---

# Photos

OpenPencil searches the free photo libraries of [Unsplash](https://unsplash.com) and [Pexels](https://www.pexels.com). Both let anyone use their photos for free, and both ask for an API key to search them, which is free too. The key stays on your device.

Searching and placing photos needs a network connection to the service you search.

## Inserting a Photo

Open the photo picker in any of these ways:

- Click the **Insert photo** button at the end of the toolbar
- Choose **Object → Insert Photo…**
- Search for **Insert Photo** in the command palette (<kbd>⌘</kbd><kbd>K</kbd>)

The service button in the picker's header switches between Unsplash and Pexels, and the picker remembers the one you used last. The first time you search a service, the picker asks for its key: follow **Get API key** to create one, paste it, and choose **Save**.

Pexels has paused issuing new API keys. If you already have a Pexels key, it still works; otherwise use Unsplash.

Type what you're looking for, such as `mountains` or `coffee`; more results load as you scroll. Hover over a photo, or move to it with the arrow keys, to see who took it.

Pick one to place it at its full size in the middle of the view. The new layer is named after its credit, such as **Photo by Ann Lee on Unsplash**, is selected, and <kbd>⌘</kbd><kbd>Z</kbd> removes it in one step.

## Filling a Layer with a Photo

To put a photo into a shape you already have, open its fill, switch the fill to **Image**, and choose **Stock photo**. The same picker opens, and the photo you pick becomes the layer's image fill, keeping the fill's scale mode.

## Credits and Keys

Unsplash and Pexels ask that photos are credited to the people who took them. OpenPencil names each placed photo after its credit and tells Unsplash when one of its photos is used, as its API terms require.

You can also change or remove the keys in **Settings → Media**. The AI chat's stock photo tool uses the same keys.
