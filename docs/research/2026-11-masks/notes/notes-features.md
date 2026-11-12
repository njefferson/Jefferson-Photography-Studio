# Notes on fitting a classifier to a few marks on a learned model's features

Written by step 434, second send. Every page was fetched to disk by the step's own fetcher into research/whole/pages-features and read there. Nothing below is from memory. Sizes are bytes as the listings give them; the limit for one file is 25 mebibytes, which is 26,214,400 bytes.

## Pages asked, one entry each

1. DINOv2 readme. Publisher: Meta AI Research, repository facebookresearch/dinov2. Address: https://raw.githubusercontent.com/facebookresearch/dinov2/main/README.md. Date: none on the page. State: reached, read to its last line (file first-01).
2. DINOv2 licence file. Same publisher. Address: https://raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE. Date: none. State: reached, read whole (first-02); it is the Apache License 2.0.
3. DINOv2 model card. Same publisher. Address: https://raw.githubusercontent.com/facebookresearch/dinov2/main/MODEL_CARD.md. Date: none. State: reached, read whole (first-03).
4. arXiv abstract page. Publisher: arXiv. Address: https://arxiv.org/abs/2304.07193. Date: version 2 of 2 February 2024. State: reached, read whole (first-04).
5. Hugging Face model search for the model's name. Publisher: Hugging Face. Address: https://huggingface.co/api/models?search=dinov2-small&limit=40. Date: none. State: reached; read by Grep for the model ids only, not to its last line (first-05). Ids it holds include facebook/dinov2-small, Xenova/dinov2-small, onnx-community/dinov2-small and sefaburak/dinov2-small-onnx. What else the search json holds was not read.
6. Convpaint readme. Publisher: Guillaume Witz, Data Science Lab, University of Bern, repository guiwitz/napari-convpaint. Address: https://raw.githubusercontent.com/guiwitz/napari-convpaint/main/README.md. Date: none. State: reached, read whole (first-06).
7. File listing of the ONNX copy by onnx-community. Publisher: Hugging Face, community account. Address: https://huggingface.co/api/models/onnx-community/dinov2-small/tree/main. State: reached, read whole (second-01).
8. Listing of its onnx folder. Address: https://huggingface.co/api/models/onnx-community/dinov2-small/tree/main/onnx. State: reached, read whole (second-02).
9. Its model card. Address: https://huggingface.co/onnx-community/dinov2-small/raw/main/README.md. State: reached, read whole (second-03).
10. Listing of the onnx folder of the copy by Xenova. Address: https://huggingface.co/api/models/Xenova/dinov2-small/tree/main/onnx. State: reached, read whole (second-04).
11. That copy's model card. Address: https://huggingface.co/Xenova/dinov2-small/raw/main/README.md. State: reached, read whole (second-05).
12. The onnx-community copy's config file. Address: https://huggingface.co/onnx-community/dinov2-small/raw/main/config.json. State: reached, read whole (second-06).
13. The paper, HTML form. Publisher: arXiv. Address: https://arxiv.org/html/2304.07193v2. Date: 2 February 2024. State: reached, 4179 lines of text; lines 1 to 2260 and 3361 to 4179 read to the last line. NOT READ: lines 2261 to 3360, which are the reference list (the page's own appendix A to C start at line 3361 and were read).
14. Convpaint licence file. Address: https://raw.githubusercontent.com/guiwitz/napari-convpaint/main/LICENSE. State: reached, read whole (third-04); BSD 3-Clause, copyright 2023 Guillaume Witz.
15. Model card of the base model on Hugging Face. Address: https://huggingface.co/facebook/dinov2-small/raw/main/README.md. State: reached, read whole (third-05).
16. Preprocessor config of the onnx-community copy. Address: https://huggingface.co/onnx-community/dinov2-small/raw/main/preprocessor_config.json. State: reached, read whole (third-06).
17. Convpaint method page, Landing. Address: https://guiwitz.github.io/napari-convpaint/book/Landing.html. State: NOT REACHED; host guiwitz.github.io, the session's network answered a tunnel failure with status 403.
18. Convpaint method page, API introduction. Address: https://guiwitz.github.io/napari-convpaint/book/Convpaint_api_introduction.html. State: NOT REACHED; same host, same answer.

The reply guard's release command was run once for guiwitz.github.io and refused, saying nothing from that host is on record as declined; no other route was tried.

## What the sources say

Which model and which of its features the sources take for marking regions
- DINOv2, a vision transformer trained without labels. The paper's linear segmentation setup (section 7.4): a linear layer is trained to predict class logits from patch tokens. The model card of the base model says the same use: linear layers and k-NN on its features. The small form is ViT-S/14: patch size 14, embedding size 384, 21 million parameters (model card), 12 blocks, 6 heads (paper, table 17).
- Convpaint (readme): the user draws scribbles on a few examples; a ConvpaintModel holds a feature extractor and a classifier; the readme's example names the extractor "dinov2". The readme does not name the classifier in the text read. The method pages that would are unread.

At what input and patch size
- Patch size 14. The model card: a 224 by 224 picture gives 256 patch tokens; a larger picture is accepted if its sides are multiples of 14, else cropped to the nearest smaller multiple. The paper trains a short last phase at 518 by 518 (section 4); the onnx-community config.json says image_size 518. The preprocessor file of that copy says resize to a shortest edge of 256, centre crop 224, ImageNet mean (0.485, 0.456, 0.406) and standard deviation (0.229, 0.224, 0.225), resampling code 3. A 1,400 by 938 picture has sides that are multiples of 14 (100 and 67 patches), so step 437's grid of 100 by 67 needs no crop by the card's rule. Whether this ONNX file accepts that size was not read from any page; it is for step 437 to try.

What classifier, and from how many marked patches
- The paper fits a linear layer on patch tokens for segmentation; for the "+ms" boosted setup it concatenates the patch tokens of the last 4 layers, uses a picture size of 640 and test-time multiscale (section 7.4). Its training sets are full datasets (for example ADE20K with 20,210 training pictures, appendix table 15), not a few marks. Its depth probes also use a linear layer on one or four layers. For the small model the paper gives linear segmentation scores of 44.3 on ADE20k, 66.6 on CityScapes and 81.1 on Pascal VOC (table 10); the model card gives 47.2 for the small model on ADE20k (the step's first-send reading of the card; the paper's table 10 gives 44.3 for the linear setup and 47.2 for the +ms setup, so the card's figure is the boosted one). No page read states how many marked patches a classifier needs. Convpaint's readme says "a few examples" drawn as scribbles; it gives no count in the text read.
- k-NN: the paper uses a nearest-neighbour test on whole-picture features (table 4, small model 79.0 for k-NN on ImageNet-1k) and cosine similarity for instance retrieval (appendix A.2). It reports no nearest-neighbour test on patches against marks.

What the sources say of a patch unlike every mark
- Nothing. No page read describes a patch that matches no marked class, nor a reject class. Step 437's rule for such a patch is the step's own and rests on no source.

How the result is brought to a finer grid
- The paper (section 7.4): the linear layer gives a low-resolution logit map (for example 32 by 32 for a model with patch size 16) which is upsampled to full resolution (512 by 512); the paper says this "cannot easily produce high-resolution segmentations". So a source says the coarse grid is brought up by plain upsampling and that the edge is coarse. Convpaint's readme names a `jafar/` folder, code adapted from an Apache 2.0 project (JAFAR), in its licence paragraph; what JAFAR does was not read from any page.

Model files, sizes and licences
- onnx-community/dinov2-small, onnx folder: model.onnx 88,532,934; fp16 44,420,939; int8, quantized and uint8 each 24,446,700; q4 16,880,041; q4f16 13,908,222; bnb4 15,553,393. The int8, quantized, uint8, q4, q4f16 and bnb4 files fit under 26,214,400; model.onnx and fp16 do not.
- Xenova/dinov2-small, onnx folder: model.onnx 88,459,888; fp16 44,427,534; uint8 22,393,453; quantized 24,451,943; q4 15,034,473; q4f16 12,917,198; bnb4 13,707,825. The uint8, quantized, q4, q4f16 and bnb4 files fit.
- Licence: the base model's card (third-05, header) says license: apache-2.0; the repository's LICENSE file is Apache 2.0; the paper (section 5) says the code and pretrained models are made available under the Apache 2.0 licence. Neither ONNX copy's card states a licence of its own; each names the base model. Whether a free app may ship it: Apache 2.0 as stated permits redistribution with its notice conditions; the licence terms were read only as the file's title and the card line, and the copies' own terms are unstated, which is said here and not settled.
- Convpaint: BSD 3-Clause (licence file read), with its `jafar/` folder under Apache 2.0 (readme). Convpaint is Python and napari; nothing read says it runs in a browser.
- What none of the pages gives: how features from a quantized file differ from the full file's; how fast any file runs on a tablet.

## What step 437's Facts have wrong

- Facts say "its paper measures those features by fitting a plain classifier on them". Right in kind (linear layer on frozen features), but the paper fits it on whole datasets, not on a few marks; no page read measures a few-mark fit.
- Facts say the grid for a 1,400 by 938 picture is 100 by 67 patches. Agrees with the card's multiple-of-14 rule. The card's default is 224 and the paper's last training size is 518, so a run at 1,400 by 938 is far above both; no page says how the features hold there. Step 437 tests it.
- Facts say its small form has copies in the ONNX form on Hugging Face. Agrees: two are listed, with the sizes above. Facts' "smallest ONNX file of the small model that fits under 25 mebibytes" is a file of 12,917,198 bytes (Xenova q4f16) by the listings, and the smallest of the onnx-community copy is 13,908,222 (q4f16). Whether q4 files run in the ONNX runtime for node was not read.
- Facts say a tool named Convpaint fits a classifier to hand marks on such features. Agrees from its readme; its classifier is not named in the text read, and its method pages did not answer.
- Facts' "a patch whose best likeness is under what the sample patches reach among their own name gives no subject": no page read supports or contradicts it; it is the step's own rule.
- Facts' "fifth part in a hundred from the bottom": no source; step's own.
- No other point differs.
