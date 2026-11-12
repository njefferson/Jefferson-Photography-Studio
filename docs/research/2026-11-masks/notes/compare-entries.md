# The entries of the comparison (fixed by figures, step 438)

Every figure is the mean overlap over union at a half over the planted pictures' masks in their coarse form, counted by compare/lib.mjs iouAtHalf (the script's own loop, not the scorer). The bar for a final mask is 0.9 and a widest band of 4 pixels; these figures are for choosing which variant goes forward and are not a measure of a mask on a photograph. A learned kind's candidate must hold all 16 planted masks (one for each name each planted picture's samples carry) to be weighed.

- recipe: the 2.79 recipe's rendering Refined to edges on the picture as it opens, carried smoothly, 38 masks; mean overlap over union at a half 0.9752 over 16 planted masks. It goes in as it stands, with no edge stage.
- features (FITTED), 24 candidates:
  - dinov2-small | linear | natural: mean overlap over union at a half 0.9135 over 16 planted masks (an entry)
  - dinov2-small | near | natural: mean overlap over union at a half 0.9129 over 16 planted masks
  - dinov2-small | linear | bright: mean overlap over union at a half 0.9090 over 16 planted masks (an entry)
  - dinov2-small | near | bright: mean overlap over union at a half 0.9081 over 16 planted masks
  - dinov2-small | linear | open: mean overlap over union at a half 0.9060 over 16 planted masks
  - dinov2-small | near | open: mean overlap over union at a half 0.9052 over 16 planted masks
  - dinov2-small | near carried from NIR_3705 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3705 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3461 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3461 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3742 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3742 | open: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3705 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3705 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3461 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3461 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3742 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3742 | natural: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3705 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3705 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3461 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3461 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | near carried from NIR_3742 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
  - dinov2-small | linear carried from NIR_3742 | bright: mean overlap over union at a half 0.0000 over 0 planted masks
- points (CLICKED), 12 candidates:
  - mobilesam | joint | open: mean overlap over union at a half 0.9746 over 16 planted masks (an entry)
  - mobilesam | joint | natural: mean overlap over union at a half 0.9732 over 16 planted masks (an entry)
  - mobilesam | joint | bright: mean overlap over union at a half 0.9718 over 16 planted masks
  - mobilesam | each | natural: mean overlap over union at a half 0.8815 over 16 planted masks
  - mobilesam | each | open: mean overlap over union at a half 0.8786 over 16 planted masks
  - mobilesam | each | bright: mean overlap over union at a half 0.8734 over 16 planted masks
  - slimsam | joint | natural: mean overlap over union at a half 0.8262 over 16 planted masks
  - slimsam | joint | bright: mean overlap over union at a half 0.8124 over 16 planted masks
  - slimsam | joint | open: mean overlap over union at a half 0.7917 over 16 planted masks
  - slimsam | each | natural: mean overlap over union at a half 0.6398 over 16 planted masks
  - slimsam | each | bright: mean overlap over union at a half 0.6364 over 16 planted masks
  - slimsam | each | open: mean overlap over union at a half 0.6187 over 16 planted masks
- classes (SCENE-CLASS), 2 candidates:
  - scene-class | each class to the name with the most sample pixels in it | natural: mean overlap over union at a half 0.8344 over 16 planted masks (an entry)
  - scene-class | each class to the name with the most sample pixels in it | open: mean overlap over union at a half 0.6915 over 16 planted masks (an entry)

Entries in the order the pictures draw them (panel 2 is the recipe; panels 3 and 4, 5 and 6, 7 and 8 are the two entries of each kind in the order below):
- recipe: recipe, open
- features: features-first (natural, linear); features-second (bright, linear)
- points: points-first (open, joint); points-second (natural, joint)
- classes: classes-open (open, each class to the name with the most sample pixels in it); classes-natural (natural, each class to the name with the most sample pixels in it)
