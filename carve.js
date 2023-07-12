var Example = Example || {};

Example.carve = function () {
  // module aliases
  var Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Vertices = Matter.Vertices,
    Composite = Matter.Composite,
    Vector = Matter.Vector,
    Body = Matter.Body,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint,
    Events = Matter.Events;

  // create an engine
  var engine = Engine.create();

  // create renderer
  var render = Render.create({
    element: document.body,
    engine: engine,
    options: {
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      wireframes: false
    }
  });

  // create runner
  var runner = Runner.create();

  Runner.run(runner, engine);
  Render.run(render);

  // initialize variables
  var world = engine.world;
  var startSlicePoint = null;
  var endSlicePoint = null;
  var isSlicing = false;
  var slicePaths = [];
  const pathAgeLimit = 500;

  // create mouse and mouseConstraint
  var mouse = Mouse.create(render.canvas);
  var mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
      stiffness: 0.1,
      render: {
        visible: false
      }
    }
  });

  // add mouseConstraint to the world
  Composite.add(world, mouseConstraint);

  // Returns a PolyK polygon from a Matter.js body
  const getPolyFromBody = (body) => {
    let vertices = body.vertices.map(v => ({ x: v.x, y: v.y }));
    return [].concat.apply([], vertices.map(v => [v.x, v.y]));
  }

  // Returns a Matter.js body from a PolyK polygon
  const createBodyFromVertices = (vertices) => {
    // Calculate center of mass for the new shape
    var center = Vertices.centre(vertices);

    var newBody = Bodies.fromVertices(center.x, center.y, [vertices], {
      friction: 0.001,
      restitution: 0.5,
    });

    return newBody;
  }

  const partitionBody = (body, startSlicePoint, endSlicePoint) => {
    let newBodies = [];
    let polygon = getPolyFromBody(body);

    if (PolyK.IsSimple(polygon)) {
      var newPolygons = PolyK.Slice(polygon, startSlicePoint.x, startSlicePoint.y, endSlicePoint.x, endSlicePoint.y);

      if (newPolygons.length > 1) {
        // Create the new bodies
        newPolygons.forEach(function (newPolygon) {
          var newVertices = [];
          for (var j = 0; j < newPolygon.length; j += 2) {
            newVertices.push({ x: newPolygon[j], y: newPolygon[j + 1] });
          }

          var newBody = createBodyFromVertices(newVertices);
          newBodies.push(newBody);
        });
      }
    }

    return newBodies;
  }

  function performSlice() {
    var bodies = Composite.allBodies(engine.world);
    for (let body of bodies) {
      let newBodies = partitionBody(body, startSlicePoint, endSlicePoint);

      if (newBodies.length > 0) {
        // Store the velocity and angular velocity of the original body
        let originalVelocity = body.velocity;
        let originalAngularVelocity = body.angularVelocity;

        // Remove the original body from the world
        Composite.remove(engine.world, body);

        for (let newBody of newBodies) {
          // Set the velocity of the new bodies to the original body's velocity
          Body.setVelocity(newBody, originalVelocity);

          // Calculate the distance from the center of the original body to the center of the new body
          let distanceVector = Vector.sub(newBody.position, body.position);

          // Calculate the additional velocity due to the tangential velocity of the original body
          let tangentialVelocity = {
            x: -originalAngularVelocity * distanceVector.y,
            y: originalAngularVelocity * distanceVector.x
          };

          // Add the tangential velocity to the new body's velocity
          Body.setVelocity(newBody, Vector.add(newBody.velocity, tangentialVelocity));

          // Set the angular velocity of the new body
          Body.setAngularVelocity(newBody, originalAngularVelocity);

          // **** Simulate sliciing with a beveled edge ****
          let splitForce = 3; // acts as the knife's bevel angle/width
          let splitImpulse = Vector.mult(Vector.normalise(distanceVector), splitForce);
          Body.setVelocity(newBody, Vector.add(newBody.velocity, splitImpulse));

          // **** Simulate force transfer through the slice ****
          let sliceVector = Vector.sub(endSlicePoint, startSlicePoint);

          // clamp the magnitude of the slice vector to a reasonable value
          let maxSliceVectorMagnitude = 500;
          sliceVector = Vector.clampMagnitude(sliceVector, maxSliceVectorMagnitude);

          // the force applied should be proportional to the mass of the new body and the velocity of the slice (ie, the length of the slice vector)
          let sliceForceFactor = 0.0003;
          let sliceForceMagnitude = sliceForceFactor * Vector.magnitude(sliceVector) * newBody.mass;

          // the force should be applied in the direction of the slice
          let force = Vector.mult(Vector.normalise(sliceVector), sliceForceMagnitude);

          // apply the force to the new body
          Body.applyForce(newBody, newBody.position, force);
        }

        // Add the new bodies to the world
        Composite.add(engine.world, newBodies);
      }
    }
  }

  /// add mouse event listeners
  Events.on(mouseConstraint, 'mousedown', function (event) {
    // check if we're mousing down on a body or not
    var bodies = Composite.allBodies(engine.world);
    for (let body of bodies) {
      if (Matter.Bounds.contains(body.bounds, mouse.position)) {
        // we're clicking on a body, so we should start dragging
        isDragging = true;
        return;
      }
    }

    // we're not clicking on a body, so we should start slicing
    isSlicing = true;

    // Disable the mouse constraint so we can move the slice points
    mouseConstraint.constraint.stiffness = 0.0;
    mouseConstraint.constraint.angularStiffness = 0.0;

    // Set the start slice point and initialize the slice path
    slicePaths.push([{ x: event.mouse.position.x, y: event.mouse.position.y, time: Date.now() }]);
  });

  Events.on(mouseConstraint, 'mousemove', function (event) {
    // if we are slicing, update the slice path
    if (isSlicing) {
      slicePaths[slicePaths.length - 1].push({ x: event.mouse.position.x, y: event.mouse.position.y, time: Date.now() });
    }
  });

  Events.on(mouseConstraint, 'mouseup', function (event) {
    if (isSlicing) {
      // add the final point to the slice path
      slicePaths[slicePaths.length - 1].push({ x: event.mouse.position.x, y: event.mouse.position.y, time: Date.now() });

      // performSlice();

      // reset isSlicing
      isSlicing = false;
    }

    // whether we were dragging or slicing, the mouse is now up so we should stop dragging
    isDragging = false;

    // Reset the mouse constraint stiffness values
    mouseConstraint.constraint.stiffness = 0.1;
    mouseConstraint.constraint.angularStiffness = 0.2;
  });

  function drawSlicePaths(render, slicePaths) {
    if (slicePaths.length <= 0) return;

    const context = render.context;
    const now = Date.now();
    const ageLimitTimestamp = now - pathAgeLimit;

    context.lineWidth = 4;
    context.strokeStyle = '#df2f2f';

    for (let path of slicePaths) {
      // only render the path if it has more than one point
      if (path.length > 1) {
        for (let i = 1; i < path.length; i++) {
          const alpha = Math.max(0, (Math.max(path[i - 1].time, path[i].time) - ageLimitTimestamp) / pathAgeLimit);
          context.globalAlpha = alpha;

          // draw a line from the previous point to the current point
          context.beginPath();
          context.moveTo(path[i - 1].x, path[i - 1].y);
          context.lineTo(path[i].x, path[i].y);
          context.stroke();
        }
      }
    }

    // Reset globalAlpha to default
    context.globalAlpha = 1;
  }

  function cleanupPaths(slicePaths, pathAgeLimit) {
    let now = Date.now();
    let ageLimitTimestamp = now - pathAgeLimit;

    for (let i = slicePaths.length - 1; i >= 0; i--) {
      let path = slicePaths[i];
      if (path.length > 0) {
        let newestPoint = path[path.length - 1];
        if (newestPoint.time < ageLimitTimestamp) {
          // This path's newest point is too old, so remove the path
          slicePaths.splice(i, 1);
        }
      } else {
        // This path is empty, so remove it
        slicePaths.splice(i, 1);
      }
    }
  }

  // create bodies
  let startingBodies = [];
  var boxA = Bodies.rectangle(400, 250, 80, 80);
  var boxB = Bodies.rectangle(500, 150, 80, 80);
  var ground = Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 50, window.innerWidth, 200, { isStatic: true });
  var ceiling = Bodies.rectangle(window.innerWidth / 2, -50, window.innerWidth, 200, { isStatic: true });
  var wallLeft = Bodies.rectangle(-50, window.innerHeight / 2, 200, window.innerHeight, { isStatic: true });
  var wallRight = Bodies.rectangle(window.innerWidth + 50, window.innerHeight / 2, 200, window.innerHeight, { isStatic: true });

  startingBodies.push(boxA);
  startingBodies.push(boxB);
  startingBodies.push(ground);
  startingBodies.push(wallLeft);
  startingBodies.push(wallRight);
  startingBodies.push(ceiling);

  Composite.add(world, startingBodies);

  // The main afterRender loop
  Events.on(render, 'afterRender', function () {
    console.log('slicePaths: ', slicePaths);
    drawSlicePaths(render, slicePaths);
    cleanupPaths(slicePaths, pathAgeLimit);

    // update the world size to match the window inner size

    // update the render bounds
    render.bounds.max.x = window.innerWidth;
    render.bounds.max.y = window.innerHeight;
  });

  // return a context for MatterTools.Demo to control
  return {
    engine: engine,
    runner: runner,
    render: render,
    canvas: render.canvas,
    stop: function () {
      Matter.Render.stop(render);
      Matter.Runner.stop(runner);
    }
  };
};