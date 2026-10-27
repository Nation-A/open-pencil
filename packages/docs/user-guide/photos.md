---
title: Photos
description: Fill a layer with a free stock photo from Unsplash or Pexels in OpenPencil.
---

# Photos

OpenPencil searches the free photo libraries of [Unsplash](https://unsplash.com) and [Pexels](https://www.pexels.com) from a layer's image fill. Both let anyone use their photos for free, and both ask for an API key to search them, which is free too. The key stays on your device.

Searching and using photos needs a network connection to the service you search.

## Filling a Layer with a Photo

Draw the frame or shape the photo should fill, then:

1. Open its fill and switch it to **Image**.
2. Choose **Stock photo**.
3. Type what you're looking for, such as `mountains` or `coffee`; more results load as you scroll. Hover over a photo, or move to it with the arrow keys, to see who took it.
4. Pick one. It becomes the layer's image fill and keeps the fill's scale mode, so **Fill**, **Fit**, **Crop**, and **Tile** work on it as on any image.

The service button in the picker's header switches between Unsplash and Pexels, and the picker remembers the one you used last. The first time you search a service, the picker asks for its key: follow **Get API key** to create one, paste it, and choose **Save**.

Pexels has paused issuing new API keys. If you already have a Pexels key, it still works; otherwise use Unsplash.

## Credits and Keys

Unsplash and Pexels ask that photos are credited to the people who took them; the picker names the photographer of each photo. OpenPencil tells Unsplash when one of its photos is used, as its API terms require.

You can also change or remove the keys in **Settings → Media**. The AI chat's stock photo tool uses the same keys.
